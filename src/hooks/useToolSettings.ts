import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TierApiLimit {
  app: number | null; // null = unlimited, number = daily limit
  own: number | null;
}

export interface TierLimits {
  premium: TierApiLimit;
  pro: TierApiLimit;
  free: TierApiLimit;
}

interface ToolSetting {
  id: string;
  tool_id: string;
  title: string;
  description: string;
  is_enabled: boolean;
  requires_auth: boolean;
  is_premium: boolean;
  daily_free_limit: number;
  credit_cost: number;
  tier_limits: TierLimits | null;
}

interface ApiModeAccess {
  all: boolean;
  premium: boolean;
  pro: boolean;
  free: boolean;
}

interface AccessControl {
  requireLogin: boolean;
  freeMode: boolean;
  promotionMode: boolean;
  promotionDailyLimit: number;
  promotionToolCount: number;
  appApiAccess?: ApiModeAccess;
  ownApiAccess?: ApiModeAccess;
  blockFreeAppApi?: boolean; // Hard block App API for Free/Guest users
}

const defaultTierLimits: TierLimits = {
  premium: { app: null, own: null },
  pro: { app: null, own: null },
  free: { app: null, own: null },
};

export function useToolSettings() {
  const [toolSettings, setToolSettings] = useState<ToolSetting[]>([]);
  const [accessControl, setAccessControl] = useState<AccessControl>({
    requireLogin: true,
    freeMode: false,
    promotionMode: false,
    promotionDailyLimit: 3,
    promotionToolCount: 3,
    appApiAccess: { all: true, premium: true, pro: true, free: true },
    ownApiAccess: { all: true, premium: true, pro: true, free: true },
    blockFreeAppApi: true, // Default: Block App API for Free/Guest
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    // Fetch tool settings
    const { data: tools } = await supabase
      .from('tool_settings')
      .select('*')
      .order('tool_id');

    if (tools) {
      // Normalize tier_limits for each tool
      const normalizedTools = tools.map(tool => ({
        ...tool,
        tier_limits: tool.tier_limits ? (tool.tier_limits as unknown as TierLimits) : defaultTierLimits,
      }));
      setToolSettings(normalizedTools as ToolSetting[]);
    }

    // Fetch access control settings
    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('*')
      .eq('key', 'access_control')
      .maybeSingle();

    if (appSettings?.value) {
      setAccessControl(appSettings.value as unknown as AccessControl);
    }

    setLoading(false);
  };

  const getToolSetting = (toolId: string): ToolSetting | undefined => {
    return toolSettings.find(t => t.tool_id === toolId);
  };

  const getToolTierLimit = (
    toolId: string,
    userPlan: 'free' | 'pro' | 'premium',
    apiMode: 'app' | 'own'
  ): number | null => {
    const tool = getToolSetting(toolId);
    if (!tool?.tier_limits) return null;
    
    const tierLimit = tool.tier_limits[userPlan];
    return tierLimit ? tierLimit[apiMode] : null;
  };

  const canAccessTool = useCallback((
    toolId: string, 
    isAuthenticated: boolean, 
    isPremiumUser: boolean,
    todayUsageCount: number,
    userPlan: 'free' | 'pro' | 'premium' = 'free',
    apiMode: 'app' | 'own' = 'app'
  ): { allowed: boolean; reason?: string } => {
    const tool = toolSettings.find(t => t.tool_id === toolId);
    
    if (!tool) {
      return { allowed: true };
    }

    if (!tool.is_enabled) {
      return { allowed: false, reason: 'ဤ Tool ကို ပိတ်ထားပါသည်' };
    }

    if (accessControl.requireLogin && !accessControl.freeMode && !isAuthenticated) {
      return { allowed: false, reason: 'Login ဝင်ရန်လိုအပ်ပါသည်' };
    }

    const effectivelyAuthenticated = isAuthenticated || !accessControl.requireLogin;
    const effectivePlan = isAuthenticated ? userPlan : 'free';

    const apiAccess = apiMode === 'app' ? accessControl.appApiAccess : accessControl.ownApiAccess;
    
    if (apiAccess) {
      if (accessControl.freeMode && apiMode === 'app' && effectivePlan === 'free') {
        return { allowed: false, reason: 'Free Mode တွင် App API မသုံးနိုင်ပါ' };
      }

      if (effectivePlan === 'premium' && apiAccess.premium === false) {
        return { allowed: false, reason: `Premium users အတွက် ${apiMode === 'app' ? 'App API' : 'Own API'} ပိတ်ထားပါသည်` };
      }
      if (effectivePlan === 'pro' && apiAccess.pro === false) {
        return { allowed: false, reason: `Pro users အတွက် ${apiMode === 'app' ? 'App API' : 'Own API'} ပိတ်ထားပါသည်` };
      }
      if (effectivePlan === 'free' && apiAccess.free === false) {
        return { allowed: false, reason: `Free users အတွက် ${apiMode === 'app' ? 'App API' : 'Own API'} ပိတ်ထားပါသည်` };
      }
    }

    // 1. ABSOLUTE PRIORITY: Premium Only check
    // Blocks ALL non-premium users regardless of Promotion Mode, Free Mode, or API mode
    if (tool.is_premium) {
      if (isPremiumUser) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Premium Plan လိုအပ်ပါသည်' };
    }

    // 2. PROMOTION MODE: When ON, allow ANY user (both API modes, no credit needed)
    // Actual usage limits (tool count + daily limit) are enforced via usePromotionTracking
    if (accessControl.promotionMode) {
      return { allowed: true };
    }

    // 3. NORMAL MODE (Promotion OFF): Standard access control
    if (isPremiumUser) {
      return { allowed: true };
    }

    if (apiMode === 'own') {
      return { allowed: true };
    }

    return { allowed: true };
  }, [toolSettings, accessControl]);

  // Helper to check API mode access only
  const canUseApiMode = (
    userPlan: 'free' | 'pro' | 'premium',
    apiMode: 'app' | 'own'
  ): { allowed: boolean; reason?: string } => {
    const apiAccess = apiMode === 'app' ? accessControl.appApiAccess : accessControl.ownApiAccess;
    
    if (!apiAccess) {
      return { allowed: true };
    }

    if (accessControl.freeMode && apiMode === 'app' && userPlan === 'free') {
      return { allowed: false, reason: 'Free Mode တွင် App API မသုံးနိုင်ပါ' };
    }
    
    if (userPlan === 'premium' && apiAccess.premium === false) {
      return { allowed: false, reason: `Premium users အတွက် ${apiMode === 'app' ? 'App API' : 'Own API'} ပိတ်ထားပါသည်` };
    }
    if (userPlan === 'pro' && apiAccess.pro === false) {
      return { allowed: false, reason: `Pro users အတွက် ${apiMode === 'app' ? 'App API' : 'Own API'} ပိတ်ထားပါသည်` };
    }
    if (userPlan === 'free' && apiAccess.free === false) {
      return { allowed: false, reason: `Free users အတွက် ${apiMode === 'app' ? 'App API' : 'Own API'} ပိတ်ထားပါသည်` };
    }

    return { allowed: true };
  };

  return {
    toolSettings,
    accessControl,
    loading,
    fetchSettings,
    getToolSetting,
    getToolTierLimit,
    canAccessTool,
    canUseApiMode,
  };
}
