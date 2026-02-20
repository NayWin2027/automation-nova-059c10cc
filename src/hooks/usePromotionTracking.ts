import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PromotionUsageRecord {
  tool_id: string;
  usage_count: number;
}

/**
 * Generate a stable device fingerprint from browser properties.
 */
function generateDeviceFingerprint(): string {
  const nav = navigator;
  const scr = window.screen;
  const raw = [
    nav.userAgent,
    nav.language,
    scr.width + 'x' + scr.height,
    scr.colorDepth,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || '',
  ].join('|');

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'fp_' + Math.abs(hash).toString(36);
}

/**
 * Best-effort device model detection from User-Agent.
 */
function detectDeviceModel(): string {
  const ua = navigator.userAgent;

  // Android device model
  const androidMatch = ua.match(/;\s*([^;)]+)\s+Build\//);
  if (androidMatch) return androidMatch[1].trim();

  // iPhone
  if (/iPhone/.test(ua)) return 'iPhone';

  // iPad
  if (/iPad/.test(ua)) return 'iPad';

  // Mac
  if (/Macintosh/.test(ua)) return 'Mac';

  // Windows
  if (/Windows/.test(ua)) return 'Windows PC';

  // Linux
  if (/Linux/.test(ua)) return 'Linux PC';

  return 'Unknown Device';
}

/**
 * Hook for tracking promotion usage by IP address + device fingerprint.
 * Aggregates usage across ALL devices with the same IP to prevent multi-device bypass.
 */
export function usePromotionTracking() {
  const [ipAddress, setIpAddress] = useState<string>('');
  const [deviceFingerprint] = useState<string>(() => generateDeviceFingerprint());
  const [deviceModel] = useState<string>(() => detectDeviceModel());
  const [promotionUsage, setPromotionUsage] = useState<PromotionUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch real IP on mount
  useEffect(() => {
    let cancelled = false;
    const fetchIp = async () => {
      const apis = [
        { url: 'https://api.ipify.org?format=json', key: 'ip' },
        { url: 'https://api.my-ip.io/v2/ip.json', key: 'ip' },
        { url: 'https://ipinfo.io/json', key: 'ip' },
      ];
      for (const api of apis) {
        try {
          const res = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
          const json = await res.json();
          if (!cancelled && json[api.key]) {
            setIpAddress(json[api.key]);
            return;
          }
        } catch {
          continue;
        }
      }
      if (!cancelled) setIpAddress('unknown_ip');
    };
    fetchIp();
    return () => { cancelled = true; };
  }, []);

  // Fetch today's promotion usage for this IP (ALL devices)
  useEffect(() => {
    if (!ipAddress || ipAddress === 'unknown_ip') {
      if (ipAddress === 'unknown_ip') setLoading(false);
      return;
    }
    fetchUsage();
  }, [ipAddress]);

  const fetchUsage = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data: result, error } = await supabase.functions.invoke('promotion-tracking', {
      body: { action: 'get_usage', ip_address: ipAddress, usage_date: today }
    });

    if (!error && result?.data && Array.isArray(result.data)) {
      // Aggregate by tool_id across all devices with same IP
      const aggregated: Record<string, number> = {};
      (result.data as any[]).forEach((d: any) => {
        aggregated[d.tool_id] = (aggregated[d.tool_id] || 0) + (d.usage_count || 0);
      });
      setPromotionUsage(
        Object.entries(aggregated).map(([tool_id, usage_count]) => ({ tool_id, usage_count }))
      );
    }
    setLoading(false);
  };

  /**
   * Check if a user can use a tool under promotion limits.
   * Returns allowed:true if within limits, allowed:false with reason if exceeded.
   */
  const checkPromotionAccess = useCallback((
    toolId: string,
    promotionDailyLimit: number,
    promotionToolCount: number,
  ): { allowed: boolean; reason?: string } => {
    const totalUsage = promotionUsage.reduce((sum, u) => sum + u.usage_count, 0);
    const distinctTools = promotionUsage.filter(u => u.usage_count > 0).length;
    const toolAlreadyUsed = promotionUsage.some(u => u.tool_id === toolId && u.usage_count > 0);

    // Check total usage limit across all tools
    if (totalUsage >= promotionDailyLimit) {
      return {
        allowed: false,
        reason: `Promotion limit (${promotionDailyLimit} ကြိမ်) ပြည့်သွားပါပြီ။ နက်ဖြန်ပြန်သုံးပါ။`,
      };
    }

    // Check distinct tool count (only block if trying a NEW tool beyond the limit)
    if (!toolAlreadyUsed && distinctTools >= promotionToolCount) {
      return {
        allowed: false,
        reason: `Tool ${promotionToolCount} မျိုးသာ သုံးခွင့်ရှိပါသည်။ နက်ဖြန်ပြန်သုံးပါ။`,
      };
    }

    return { allowed: true };
  }, [promotionUsage]);

  /**
   * Record one usage of a tool for this IP + device.
   */
  const recordPromotionUsage = useCallback(async (toolId: string) => {
    if (!ipAddress || ipAddress === 'unknown_ip') return;

    const today = new Date().toISOString().split('T')[0];

    await supabase.functions.invoke('promotion-tracking', {
      body: {
        action: 'record_usage',
        ip_address: ipAddress,
        device_fingerprint: deviceFingerprint,
        device_model: deviceModel,
        tool_id: toolId,
        usage_date: today,
      }
    });

    const existing = promotionUsage.find(u => u.tool_id === toolId);
    if (existing) {
      setPromotionUsage(prev =>
        prev.map(u => u.tool_id === toolId ? { ...u, usage_count: u.usage_count + 1 } : u)
      );
    } else {
      setPromotionUsage(prev => [...prev, { tool_id: toolId, usage_count: 1 }]);
    }
  }, [ipAddress, deviceFingerprint, deviceModel, promotionUsage]);

  return {
    checkPromotionAccess,
    recordPromotionUsage,
    loading,
    ipAddress,
    deviceModel,
    deviceFingerprint,
    refreshUsage: fetchUsage,
  };
}
