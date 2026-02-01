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
}

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
    todayUsageCount: number,
    userPlan: 'free' | 'pro' | 'premium' = 'free',
    apiMode: 'app' | 'own' = 'app'
  ): { allowed: boolean; reason?: string } => {
    const tool = getToolSetting(toolId);
    
    if (!tool) {
      return { allowed: true }; // Default allow if no settings
    }

    if (!tool.is_enabled) {
      return { allowed: false, reason: 'ဤ Tool ကို ပိတ်ထားပါသည်' };
    }

    // Check API mode access control
    const apiAccess = apiMode === 'app' ? accessControl.appApiAccess : accessControl.ownApiAccess;
    
    if (apiAccess) {
      // Free Mode rule: App API is not allowed for free/guest users.
      if (accessControl.freeMode && apiMode === 'app' && (!isAuthenticated || userPlan === 'free')) {
        return { allowed: false, reason: 'Free Mode တွင် App API မသုံးနိုင်ပါ' };
      }

      // Check plan-specific access
      if (userPlan === 'premium' && apiAccess.premium === false) {
        return { allowed: false, reason: `Premium users အတွက် ${apiMode === 'app' ? 'App API' : 'Own API'} ပိတ်ထားပါသည်` };
      }
      if (userPlan === 'pro' && apiAccess.pro === false) {
        return { allowed: false, reason: `Pro users အတွက် ${apiMode === 'app' ? 'App API' : 'Own API'} ပိတ်ထားပါသည်` };
      }
      if (userPlan === 'free' && apiAccess.free === false) {
        return { allowed: false, reason: `Free users အတွက် ${apiMode === 'app' ? 'App API' : 'Own API'} ပိတ်ထားပါသည်` };
      }
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

    // **OWN API MODE BYPASS**: Own API users are NOT subject to daily limits
    if (apiMode === 'own') {
      return { allowed: true };
    }

    // Check daily limit in promotion mode (only for App API)
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

  // Helper to check API mode access only
  const canUseApiMode = (
    userPlan: 'free' | 'pro' | 'premium',
    apiMode: 'app' | 'own'
  ): { allowed: boolean; reason?: string } => {
    const apiAccess = apiMode === 'app' ? accessControl.appApiAccess : accessControl.ownApiAccess;
    
    if (!apiAccess) {
      return { allowed: true };
    }

    // NOTE: 'ALL' toggle is UI convenience only; tier toggles must always have effect.
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
    canAccessTool,
    canUseApiMode,
  };
}
