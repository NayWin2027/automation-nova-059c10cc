import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
}

interface AccessControl {
  requireLogin: boolean;
  freeMode: boolean;
  promotionMode: boolean;
  promotionDailyLimit: number;
  promotionToolCount: number;
}

export function useToolSettings() {
  const [toolSettings, setToolSettings] = useState<ToolSetting[]>([]);
  const [accessControl, setAccessControl] = useState<AccessControl>({
    requireLogin: true,
    freeMode: false,
    promotionMode: false,
    promotionDailyLimit: 3,
    promotionToolCount: 3,
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
      setToolSettings(tools as ToolSetting[]);
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

  const canAccessTool = (
    toolId: string, 
    isAuthenticated: boolean, 
    isPremiumUser: boolean,
    todayUsageCount: number
  ): { allowed: boolean; reason?: string } => {
    const tool = getToolSetting(toolId);
    
    if (!tool) {
      return { allowed: true }; // Default allow if no settings
    }

    if (!tool.is_enabled) {
      return { allowed: false, reason: 'ဤ Tool ကို ပိတ်ထားပါသည်' };
    }

    // Check if login is required
    if (accessControl.requireLogin && tool.requires_auth && !isAuthenticated) {
      return { allowed: false, reason: 'Login ဝင်ရန်လိုအပ်ပါသည်' };
    }

    // Premium users can access everything
    if (isPremiumUser) {
      return { allowed: true };
    }

    // Check if tool is premium-only
    if (tool.is_premium && !accessControl.freeMode && !accessControl.promotionMode) {
      return { allowed: false, reason: 'Premium Plan လိုအပ်ပါသည်' };
    }

    // Check daily limit in promotion mode
    if (accessControl.promotionMode && !accessControl.freeMode) {
      const limit = tool.daily_free_limit || accessControl.promotionDailyLimit;
      if (todayUsageCount >= limit) {
        return { 
          allowed: false, 
          reason: `တစ်နေ့လျှင် ${limit} ကြိမ်သာ အသုံးပြုနိုင်ပါသည်` 
        };
      }
    }

    return { allowed: true };
  };

  return {
    toolSettings,
    accessControl,
    loading,
    fetchSettings,
    getToolSetting,
    canAccessTool,
  };
}
