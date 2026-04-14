import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings, Palette, Save, RefreshCw, Lock, Unlock, Crown,
  Zap, Edit3, Gift, Key, Server, Shield, BookOpen, Megaphone, X } from
"lucide-react";
import TierLimitsEditor from "./TierLimitsEditor";
import type { TierLimits } from "@/hooks/useToolSettings";
import { TwoFactorSetup } from "./TwoFactorSetup";
import { useAuth } from "@/hooks/useAuth";

interface BrandingSettings {
  appName: string;
  title: string;
  subtitle: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}

interface FeatureSettings {
  maxDevices: number;
  defaultCredits: number;
}

interface ReferralRewardSettings {
  credits: number;
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
  appApiAccess: ApiModeAccess;
  ownApiAccess: ApiModeAccess;
  blockFreeAppApi: boolean;
  planMode: boolean;
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
  tier_limits: TierLimits;
}

const defaultTierLimits: TierLimits = {
  premium: { app: null, own: null },
  pro: { app: null, own: null },
  free: { app: null, own: null }
};

function normalizeApiModeAccess(input?: Partial<ApiModeAccess> | null): ApiModeAccess {
  return {
    all: input?.all ?? true,
    premium: input?.premium ?? true,
    pro: input?.pro ?? true,
    free: input?.free ?? true
  };
}

function normalizeAccessControl(input?: Partial<AccessControl> | null): AccessControl {
  return {
    requireLogin: input?.requireLogin ?? true,
    freeMode: input?.freeMode ?? false,
    promotionMode: input?.promotionMode ?? false,
    promotionDailyLimit: input?.promotionDailyLimit ?? 3,
    promotionToolCount: input?.promotionToolCount ?? 3,
    appApiAccess: normalizeApiModeAccess(input?.appApiAccess),
    ownApiAccess: normalizeApiModeAccess(input?.ownApiAccess),
    blockFreeAppApi: input?.blockFreeAppApi ?? true,
    planMode: input?.planMode ?? false,
  };
}

const OnOffBadge = ({ checked }: {checked: boolean;}) =>
<span
  className={
  "min-w-10 text-center text-3xs px-2 py-0.5 rounded border " + (
  checked ?
  "bg-primary/10 text-primary border-primary/20" :
  "bg-secondary/30 text-muted-foreground border-border/30")
  }>

    {checked ? "ON" : "OFF"}
  </span>;


const AdminSettingsTab: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getAppSettings, updateAppSettings } = useAdmin();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'access' | 'branding' | 'tools' | 'security' | 'announce'>('access');

  interface AnnouncementItem {
    id?: string;
    message: string;
    type: string;
    is_active: boolean;
    action_label: string;
    action_url: string;
    custom_color: string;
  }

  const emptyAnnouncement: AnnouncementItem = {
    message: "", type: "info", is_active: false, action_label: "", action_url: "", custom_color: ""
  };

  const [announcementList, setAnnouncementList] = useState<AnnouncementItem[]>([]);
  const [savingAnnounceIdx, setSavingAnnounceIdx] = useState<number | null>(null);

  const [branding, setBranding] = useState<BrandingSettings>({
    appName: "MediaMaster",
    title: "AI-Powered Tools",
    subtitle: "Pro Edition V8.0",
    primaryColor: "199 89% 48%",
    backgroundColor: "222 47% 6%",
    textColor: "210 20% 92%",
    accentColor: "199 89% 48%",
    fontFamily: "Inter"
  });

  const [features, setFeatures] = useState<FeatureSettings>({
    maxDevices: 2,
    defaultCredits: 100
  });
  const [referralReward, setReferralReward] = useState<ReferralRewardSettings>({
    credits: 50
  });

  const [accessControl, setAccessControl] = useState<AccessControl>({
    requireLogin: true,
    freeMode: false,
    promotionMode: false,
    promotionDailyLimit: 3,
    promotionToolCount: 3,
    appApiAccess: { all: true, premium: true, pro: true, free: true },
    ownApiAccess: { all: true, premium: true, pro: true, free: true },
    blockFreeAppApi: true,
    planMode: false,
  });

  const [toolSettings, setToolSettings] = useState<ToolSetting[]>([]);
  const [editingTool, setEditingTool] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);

    // Load app settings
    const { data, error } = await getAppSettings();
    if (!error && data) {
      const brandingData = data.find((s: {key: string;}) => s.key === "branding");
      const featuresData = data.find((s: {key: string;}) => s.key === "features");
      const accessData = data.find((s: {key: string;}) => s.key === "access_control");
      const referralRewardData = data.find((s: {key: string;}) => s.key === "referral_reward");

      if (brandingData?.value) {
        setBranding(brandingData.value as unknown as BrandingSettings);
      }
      if (featuresData?.value) {
        setFeatures(featuresData.value as unknown as FeatureSettings);
      }
      if (accessData?.value) {
        setAccessControl(normalizeAccessControl(accessData.value as unknown as Partial<AccessControl>));
      }
      if (referralRewardData?.value && typeof referralRewardData.value === "object") {
        const creditsValue = Number((referralRewardData.value as { credits?: unknown }).credits);
        setReferralReward({
          credits: Number.isFinite(creditsValue) && creditsValue >= 0 ? creditsValue : 50
        });
      }
    }

    // Load tool settings
    const { data: tools } = await supabase.
    from('tool_settings').
    select('*').
    order('tool_id');

    if (tools) {
      const normalizedTools = tools.map((tool) => ({
        ...tool,
        tier_limits: tool.tier_limits ?
        tool.tier_limits as unknown as TierLimits :
        defaultTierLimits
      }));
      setToolSettings(normalizedTools as ToolSetting[]);
    }

    // Load announcements (all)
    const { data: anns } = await supabase
      .from('site_announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (anns && anns.length > 0) {
      setAnnouncementList(anns.map((a: any) => ({
        id: a.id,
        message: a.message,
        type: a.type,
        is_active: a.is_active,
        action_label: a.action_label || "",
        action_url: a.action_url || "",
        custom_color: a.custom_color || "",
      })));
    }

    setLoading(false);
  };

  const handleSaveAccessControl = async () => {
    setSaving(true);
    const normalized = normalizeAccessControl(accessControl);
    setAccessControl(normalized);
    const { error } = await updateAppSettings("access_control", normalized);

    if (error) {
      toast({
        title: "❌ သိမ်းမရပါ",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ Access Control သိမ်းပြီး",
        description: "ပြောင်းလဲမှုများ အသက်ဝင်ပါပြီ"
      });
    }
    setSaving(false);
  };

  const handleSaveReferralReward = async () => {
    setSaving(true);
    const normalizedCredits = Math.max(0, Math.trunc(Number(referralReward.credits) || 0));
    setReferralReward({ credits: normalizedCredits });

    const { error } = await updateAppSettings("referral_reward", { credits: normalizedCredits });

    if (error) {
      toast({
        title: "❌ သိမ်းမရပါ",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ Referral Reward သိမ်းပြီး",
        description: `Default reward ကို ${normalizedCredits} credits အဖြစ်ပြောင်းပြီးပါပြီ`
      });
    }
    setSaving(false);
  };

  const handleSaveBranding = async () => {
    setSaving(true);
    const { error } = await updateAppSettings("branding", branding);

    if (error) {
      toast({
        title: "❌ သိမ်းမရပါ",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ Branding သိမ်းပြီး",
        description: "ပြောင်းလဲမှုများ အသက်ဝင်ပါပြီ"
      });

      // Apply changes to CSS variables
      const root = document.documentElement;
      root.style.setProperty("--primary", branding.primaryColor);
      root.style.setProperty("--background", branding.backgroundColor);
      root.style.setProperty("--foreground", branding.textColor);
    }
    setSaving(false);
  };

  const handleUpdateTool = async (tool: ToolSetting) => {
    setSaving(true);
    const { error } = await supabase.
    from('tool_settings').
    update({
      title: tool.title,
      description: tool.description,
      is_enabled: tool.is_enabled,
      requires_auth: tool.requires_auth,
      is_premium: tool.is_premium,
      daily_free_limit: tool.daily_free_limit,
      credit_cost: tool.credit_cost,
      tier_limits: JSON.parse(JSON.stringify(tool.tier_limits))
    }).
    eq('id', tool.id);

    if (error) {
      toast({
        title: "❌ Tool သိမ်းမရပါ",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ Tool သိမ်းပြီး",
        description: `${tool.title} အပြောင်းအလဲများ အသက်ဝင်ပါပြီ`
      });
      setEditingTool(null);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>);

  }

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-1 p-0.5 bg-secondary/30 rounded-lg w-fit">
        <button
          onClick={() => setActiveSection('access')}
          className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors ${
          activeSection === 'access' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`
          }>

          <Lock className="w-3 h-3 inline mr-1" />
          Access Control
        </button>
        <button
          onClick={() => setActiveSection('security')}
          className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors ${
          activeSection === 'security' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`
          }>

           <Shield className="w-3 h-3 inline mr-1" />
           Security
         </button>
         <button
          onClick={() => setActiveSection('tools')}
          className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors ${
          activeSection === 'tools' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`
          }>

          <Edit3 className="w-3 h-3 inline mr-1" />
          Tool Settings
        </button>
        <button
          onClick={() => setActiveSection('branding')}
          className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors ${
          activeSection === 'branding' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`
          }>
          <Palette className="w-3 h-3 inline mr-1" />
          Branding
        </button>
        <button
          onClick={() => setActiveSection('announce')}
          className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors ${
          activeSection === 'announce' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`
          }>
          <Megaphone className="w-3 h-3 inline mr-1" />
          Announcement
        </button>
      </div>

      {/* Access Control Section */}
      {activeSection === 'access' &&
      <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Lock className="w-4 h-4 text-cyan-500" />
                Login & Access
              </CardTitle>
              <CardDescription className="text-2xs">Tools အသုံးပြုခွင့် ထိန်းချုပ်ရန်</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-3xs text-muted-foreground text-base">
                <span className="font-medium text-foreground">ON</span> = ခွင့်ပြု (အသုံးပြုလို့ရ) •{" "}
                <span className="font-medium text-foreground">OFF</span> = ပိတ် (အသုံးမပြုလို့ရ)
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Login Required</Label>
                  <p className="text-muted-foreground text-base">Tools သုံးရန် Login လိုအပ်မလား</p>
                </div>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.requireLogin} />
                  <Switch
                  checked={accessControl.requireLogin}
                  onCheckedChange={(checked) => setAccessControl({ ...accessControl, requireLogin: checked })} />

                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Unlock className="w-3 h-3 text-green-500" />
                    Free Mode
                  </Label>
                  <p className="text-2xs text-muted-foreground">Tools အားလုံး Free ဖြစ်မယ်</p>
                </div>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.freeMode} />
                  <Switch
                  checked={accessControl.freeMode}
                  onCheckedChange={(checked) => setAccessControl({ ...accessControl, freeMode: checked })} />

                </div>
              </div>

              {/* Block Free App API Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Server className="w-3 h-3 text-red-500" />
                    Block Free App API
                  </Label>
                  <p className="text-muted-foreground text-base">Free/Guest များ App API သုံးခွင့်မပေး</p>
                </div>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.blockFreeAppApi} />
                  <Switch
                  checked={accessControl.blockFreeAppApi}
                  onCheckedChange={(checked) => setAccessControl({ ...accessControl, blockFreeAppApi: checked })} />

                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Gift className="w-4 h-4 text-amber-500" />
                Promotion Mode
              </CardTitle>
              <CardDescription className="text-2xs">အထူးအကျိုးခံစားခွင့်များ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Promotion Active</Label>
                  <p className="text-2xs text-muted-foreground">Free trial ပေးမယ်</p>
                </div>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.promotionMode} />
                  <Switch
                  checked={accessControl.promotionMode}
                  onCheckedChange={(checked) => setAccessControl({ ...accessControl, promotionMode: checked })} />

                </div>
              </div>

              {accessControl.promotionMode &&
            <>
                  <div className="space-y-1">
                    <Label className="text-2xs">တစ်နေ့ သုံးလို့ရသည့် အကြိမ်</Label>
                    <Input
                  type="number"
                  value={accessControl.promotionDailyLimit}
                  onChange={(e) => setAccessControl({
                    ...accessControl,
                    promotionDailyLimit: parseInt(e.target.value) || 3
                  })}
                  min={1}
                  max={100}
                  className="h-8 text-xs" />

                  </div>
                  <div className="space-y-1">
                    <Label className="text-2xs">Free Tool အရေအတွက်</Label>
                    <Input
                  type="number"
                  value={accessControl.promotionToolCount}
                  onChange={(e) => setAccessControl({
                    ...accessControl,
                    promotionToolCount: parseInt(e.target.value) || 3
                  })}
                  min={1}
                  max={20}
                  className="h-8 text-xs" />

                  </div>
                </>
            }

              {/* Plan Mode Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Crown className="w-3 h-3 text-purple-500" />
                    Plan Mode
                  </Label>
                  <p className="text-2xs text-muted-foreground">Tool နှိပ်ရင် Plans page ကိုရောက်မယ်</p>
                </div>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.planMode} />
                  <Switch
                  checked={accessControl.planMode}
                  onCheckedChange={(checked) => setAccessControl({ ...accessControl, planMode: checked })} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 border-border/50 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Gift className="w-4 h-4 text-amber-500" />
                Referral Reward
              </CardTitle>
              <CardDescription className="text-2xs">Referrer ID မှန်ရင် auto ပေါင်းမယ့် default credits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Default Referral Credits</Label>
                <Input
                  type="number"
                  min={0}
                  value={referralReward.credits}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    setReferralReward({
                      credits: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
                    });
                  }}
                  className="h-8 text-xs"
                />
                <p className="text-2xs text-muted-foreground">
                  Add User / Order approve မှာ Referrer ID ထည့်ထားရင် ဒီ credits ပမာဏကို auto ပေါင်းပေးမယ်
                </p>
              </div>
              <Button
                onClick={handleSaveReferralReward}
                disabled={saving}
                className="bg-gradient-to-r from-amber-500 to-orange-600"
              >
                <Save className="w-3 h-3 mr-1" />
                {saving ? "Saving..." : "Save Referral Reward"}
              </Button>
            </CardContent>
          </Card>

          {/* App API Access Control */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Server className="w-4 h-4 text-blue-500" />
                APP API
              </CardTitle>
              <CardDescription className="text-2xs">Shared API Key အသုံးပြုခွင့် ထိန်းချုပ်ရန်</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between py-1 border-b border-border/30">
                <Label className="text-xs font-semibold text-red-400">ALL (Master)</Label>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.appApiAccess.all} />
                  <Switch
                  checked={accessControl.appApiAccess.all}
                  onCheckedChange={(checked) =>
                  setAccessControl({
                    ...accessControl,
                    appApiAccess: { ...accessControl.appApiAccess, all: checked }
                  })
                  } />

                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <Label className="text-xs flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" />
                  Premium
                </Label>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.appApiAccess.premium} />
                  <Switch
                  checked={accessControl.appApiAccess.premium}
                  onCheckedChange={(checked) =>
                  setAccessControl({
                    ...accessControl,
                    appApiAccess: { ...accessControl.appApiAccess, premium: checked }
                  })
                  }
                  disabled={!accessControl.appApiAccess.all} />

                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <Label className="text-xs flex items-center gap-1">
                  <Zap className="w-3 h-3 text-purple-400" />
                  Pro
                </Label>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.appApiAccess.pro} />
                  <Switch
                  checked={accessControl.appApiAccess.pro}
                  onCheckedChange={(checked) =>
                  setAccessControl({
                    ...accessControl,
                    appApiAccess: { ...accessControl.appApiAccess, pro: checked }
                  })
                  }
                  disabled={!accessControl.appApiAccess.all} />

                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <Label className="text-xs text-muted-foreground">Free</Label>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.appApiAccess.free} />
                  <Switch
                  checked={accessControl.appApiAccess.free}
                  onCheckedChange={(checked) =>
                  setAccessControl({
                    ...accessControl,
                    appApiAccess: { ...accessControl.appApiAccess, free: checked }
                  })
                  }
                  disabled={!accessControl.appApiAccess.all} />

                </div>
              </div>
            </CardContent>
          </Card>

          {/* Own API Access Control */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Key className="w-4 h-4 text-green-500" />
                OWN API
              </CardTitle>
              <CardDescription className="text-2xs">User ကိုယ်ပိုင် API Key သုံးခွင့် ထိန်းချုပ်ရန်</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between py-1 border-b border-border/30">
                <Label className="text-xs font-semibold text-red-400">ALL (Master)</Label>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.ownApiAccess.all} />
                  <Switch
                  checked={accessControl.ownApiAccess.all}
                  onCheckedChange={(checked) =>
                  setAccessControl({
                    ...accessControl,
                    ownApiAccess: { ...accessControl.ownApiAccess, all: checked }
                  })
                  } />

                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <Label className="text-xs flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" />
                  Premium
                </Label>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.ownApiAccess.premium} />
                  <Switch
                  checked={accessControl.ownApiAccess.premium}
                  onCheckedChange={(checked) =>
                  setAccessControl({
                    ...accessControl,
                    ownApiAccess: { ...accessControl.ownApiAccess, premium: checked }
                  })
                  }
                  disabled={!accessControl.ownApiAccess.all} />

                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <Label className="text-xs flex items-center gap-1">
                  <Zap className="w-3 h-3 text-purple-400" />
                  Pro
                </Label>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.ownApiAccess.pro} />
                  <Switch
                  checked={accessControl.ownApiAccess.pro}
                  onCheckedChange={(checked) =>
                  setAccessControl({
                    ...accessControl,
                    ownApiAccess: { ...accessControl.ownApiAccess, pro: checked }
                  })
                  }
                  disabled={!accessControl.ownApiAccess.all} />

                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <Label className="text-xs text-muted-foreground">Free</Label>
                <div className="flex items-center gap-2">
                  <OnOffBadge checked={accessControl.ownApiAccess.free} />
                  <Switch
                  checked={accessControl.ownApiAccess.free}
                  onCheckedChange={(checked) =>
                  setAccessControl({
                    ...accessControl,
                    ownApiAccess: { ...accessControl.ownApiAccess, free: checked }
                  })
                  }
                  disabled={!accessControl.ownApiAccess.all} />

                </div>
              </div>
            </CardContent>
          </Card>

          <div className="md:col-span-2">
            <Button
            onClick={handleSaveAccessControl}
            disabled={saving}
            className="bg-gradient-to-r from-cyan-500 to-blue-600">

              <Save className="w-3 h-3 mr-1" />
              {saving ? "Saving..." : "Save Access Control"}
            </Button>
          </div>
        </div>
      }

      {/* Tool Settings Section */}
      {activeSection === 'tools' &&
      <div className="space-y-2">
          <Card className="border-primary/20 bg-card/50">
            <CardContent className="p-3">
              <button
                onClick={() => navigate('/tutorials')}
                className="w-full text-left rounded-lg border border-primary/20 bg-background/40 p-3 hover:bg-background/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Tutorial Videos</h3>
                    <p className="text-2xs text-muted-foreground">Tool Settings ထဲကနေ Tutorial page ကို တိုက်ရိုက်ဖွင့်နိုင်ပါပြီ</p>
                  </div>
                </div>
              </button>
            </CardContent>
          </Card>
          {toolSettings.map((tool) =>
        <Card key={tool.id} className="border-border/50 bg-card/50">
              <CardContent className="p-3">
                {editingTool === tool.id ?
            <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-2xs">Title</Label>
                        <Input
                    value={tool.title}
                    onChange={(e) => setToolSettings((prev) =>
                    prev.map((t) => t.id === tool.id ? { ...t, title: e.target.value } : t)
                    )}
                    className="h-7 text-xs" />

                      </div>
                      <div className="space-y-1">
                        <Label className="text-2xs">Daily Limit</Label>
                        <Input
                    type="number"
                    value={tool.daily_free_limit}
                    onChange={(e) => setToolSettings((prev) =>
                    prev.map((t) => t.id === tool.id ? { ...t, daily_free_limit: parseInt(e.target.value) || 0 } : t)
                    )}
                    className="h-7 text-xs"
                    min={0} />

                      </div>
                      <div className="space-y-1">
                        <Label className="text-2xs">💳 Credit Cost</Label>
                        <Input
                    type="number"
                    value={tool.credit_cost || 10}
                    onChange={(e) => setToolSettings((prev) =>
                    prev.map((t) => t.id === tool.id ? { ...t, credit_cost: parseInt(e.target.value) || 10 } : t)
                    )}
                    className="h-7 text-xs"
                    min={0} />

                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-2xs">Description</Label>
                      <Input
                  value={tool.description}
                  onChange={(e) => setToolSettings((prev) =>
                  prev.map((t) => t.id === tool.id ? { ...t, description: e.target.value } : t)
                  )}
                  className="h-7 text-xs" />

                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                    checked={tool.is_enabled}
                    onCheckedChange={(checked) => setToolSettings((prev) =>
                    prev.map((t) => t.id === tool.id ? { ...t, is_enabled: checked } : t)
                    )} />

                        <span className="text-2xs">Enabled</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                    checked={tool.requires_auth}
                    onCheckedChange={(checked) => setToolSettings((prev) =>
                    prev.map((t) => t.id === tool.id ? { ...t, requires_auth: checked } : t)
                    )} />

                        <span className="text-2xs">Auth Required</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                    checked={tool.is_premium}
                    onCheckedChange={(checked) => setToolSettings((prev) =>
                    prev.map((t) => t.id === tool.id ? { ...t, is_premium: checked } : t)
                    )} />

                        <span className="text-2xs">Premium Only</span>
                      </div>
                    </div>
                    
                    {/* Tier Limits Editor */}
                    <TierLimitsEditor
                tierLimits={tool.tier_limits}
                onChange={(limits) => setToolSettings((prev) =>
                prev.map((t) => t.id === tool.id ? { ...t, tier_limits: limits } : t)
                )} />

                    
                    <div className="flex gap-2">
                      <Button
                  size="sm"
                  onClick={() => handleUpdateTool(tool)}
                  disabled={saving}
                  className="h-7 text-2xs bg-gradient-to-r from-cyan-500 to-blue-600">

                        <Save className="w-3 h-3 mr-1" />
                        Save
                      </Button>
                      <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingTool(null)}
                  className="h-7 text-2xs">

                        Cancel
                      </Button>
                    </div>
                  </div> :

            <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
                tool.is_enabled ? 'bg-primary/20' : 'bg-muted'}`
                }>
                        <Zap className={`w-4 h-4 ${tool.is_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-lg">{tool.title}</h4>
                          {tool.is_premium &&
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-3xs flex items-center gap-0.5">
                              <Crown className="w-2 h-2" />
                              PRO
                            </span>
                    }
                          {!tool.is_enabled &&
                    <span className="px-1.5 py-0.5 rounded bg-destructive/20 text-destructive text-3xs">OFF</span>
                    }
                        </div>
                        <p className="text-muted-foreground text-xs">{tool.description}</p>
                        <div className="flex gap-2 mt-1 text-3xs text-muted-foreground">
                          <span>{tool.requires_auth ? '🔐 Login Required' : '🌐 Public'}</span>
                          <span>• {tool.daily_free_limit || '∞'} uses/day</span>
                          <span>• 💳 {tool.credit_cost || 10} credits</span>
                        </div>
                      </div>
                    </div>
                    <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingTool(tool.id)}
                className="h-7 text-2xs">

                      <Edit3 className="w-3 h-3" />
                    </Button>
                  </div>
            }
              </CardContent>
            </Card>
        )}
        </div>
      }

      {/* Branding Section */}
      {activeSection === 'branding' &&
      <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Palette className="w-4 h-4 text-purple-500" />
              Branding & Appearance
            </CardTitle>
            <CardDescription className="text-2xs">App ပုံပန်းသဏ္ဍာန် ပြောင်းလဲရန်</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-2xs">App Name</Label>
                <Input
                value={branding.appName}
                onChange={(e) => setBranding({ ...branding, appName: e.target.value })}
                className="h-8 text-xs" />

              </div>
              <div className="space-y-1">
                <Label className="text-2xs">Subtitle</Label>
                <Input
                value={branding.subtitle}
                onChange={(e) => setBranding({ ...branding, subtitle: e.target.value })}
                className="h-8 text-xs" />

              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-2xs">Primary (HSL)</Label>
                <Input
                value={branding.primaryColor}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                className="h-7 text-2xs" />

                <div
                className="h-6 rounded border"
                style={{ backgroundColor: `hsl(${branding.primaryColor})` }} />

              </div>
              <div className="space-y-1">
                <Label className="text-2xs">Background (HSL)</Label>
                <Input
                value={branding.backgroundColor}
                onChange={(e) => setBranding({ ...branding, backgroundColor: e.target.value })}
                className="h-7 text-2xs" />

                <div
                className="h-6 rounded border"
                style={{ backgroundColor: `hsl(${branding.backgroundColor})` }} />

              </div>
              <div className="space-y-1">
                <Label className="text-2xs">Text (HSL)</Label>
                <Input
                value={branding.textColor}
                onChange={(e) => setBranding({ ...branding, textColor: e.target.value })}
                className="h-7 text-2xs" />

                <div
                className="h-6 rounded border"
                style={{ backgroundColor: `hsl(${branding.textColor})` }} />

              </div>
              <div className="space-y-1">
                <Label className="text-2xs">Accent (HSL)</Label>
                <Input
                value={branding.accentColor || branding.primaryColor}
                onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                className="h-7 text-2xs" />

                <div
                className="h-6 rounded border"
                style={{ backgroundColor: `hsl(${branding.accentColor || branding.primaryColor})` }} />

              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-2xs">🔤 Font Family</Label>
                <Input
                value={branding.fontFamily || "Inter"}
                onChange={(e) => setBranding({ ...branding, fontFamily: e.target.value })}
                placeholder="Inter, Roboto, Poppins..."
                className="h-8 text-xs" />

              </div>
              <div className="space-y-1">
                <Label className="text-2xs">📝 Title</Label>
                <Input
                value={branding.title}
                onChange={(e) => setBranding({ ...branding, title: e.target.value })}
                className="h-8 text-xs" />

              </div>
            </div>

            <Button
            onClick={handleSaveBranding}
            disabled={saving}
            className="bg-gradient-to-r from-purple-500 to-pink-600">

              <Save className="w-3 h-3 mr-1" />
              {saving ? "Saving..." : "Save Branding"}
            </Button>
          </CardContent>
        </Card>
      }
 
       {/* Security Section */}
       {activeSection === 'security' && user &&
      <div className="space-y-4">
           <TwoFactorSetup userId={user.id} />
         </div>
      }

      {/* Announcement Section */}
      {activeSection === 'announce' &&
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              Site Announcements
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAnnouncementList([...announcementList, { ...emptyAnnouncement }])}
              className="h-7 text-xs"
            >
              + Add Announcement
            </Button>
          </div>

          {announcementList.length === 0 && (
            <Card className="border-border/50 bg-card/50">
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Announcement မရှိသေးပါ။ "+ Add Announcement" ကိုနှိပ်ပါ။
              </CardContent>
            </Card>
          )}

          {announcementList.map((ann, idx) => (
            <Card key={ann.id || `new-${idx}`} className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Megaphone className="w-3.5 h-3.5 text-primary" />
                    Announcement #{idx + 1}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={async () => {
                      if (ann.id) {
                        await supabase.from('site_announcements').delete().eq('id', ann.id);
                      }
                      setAnnouncementList(announcementList.filter((_, i) => i !== idx));
                      toast({ title: "🗑️ ဖျက်ပြီး" });
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs">Active</Label>
                    <p className="text-2xs text-muted-foreground">ဖွင့်/ပိတ်</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <OnOffBadge checked={ann.is_active} />
                    <Switch
                      checked={ann.is_active}
                      onCheckedChange={(checked) => {
                        const updated = [...announcementList];
                        updated[idx] = { ...ann, is_active: checked };
                        setAnnouncementList(updated);
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-2xs">Message</Label>
                  <Input
                    value={ann.message}
                    onChange={(e) => {
                      const updated = [...announcementList];
                      updated[idx] = { ...ann, message: e.target.value };
                      setAnnouncementList(updated);
                    }}
                    placeholder="ကြေညာစာ ရေးပါ..."
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-2xs">Type</Label>
                  <select
                    value={ann.type}
                    onChange={(e) => {
                      const updated = [...announcementList];
                      updated[idx] = { ...ann, type: e.target.value };
                      setAnnouncementList(updated);
                    }}
                    className="w-full h-8 text-xs rounded-md border border-input bg-background px-3"
                  >
                    <option value="error">🔴 Error (Red)</option>
                    <option value="warning">🟡 Warning (Amber)</option>
                    <option value="info">🔵 Info (Blue)</option>
                    <option value="success">🟢 Success (Green)</option>
                    <option value="custom">🎨 Custom Color</option>
                  </select>
                </div>

                {ann.type === "custom" && (
                  <div className="space-y-1">
                    <Label className="text-2xs">Custom Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={ann.custom_color || "#3b82f6"}
                        onChange={(e) => {
                          const updated = [...announcementList];
                          updated[idx] = { ...ann, custom_color: e.target.value };
                          setAnnouncementList(updated);
                        }}
                        className="w-10 h-8 rounded border border-input cursor-pointer bg-transparent p-0.5"
                      />
                      <Input
                        value={ann.custom_color || "#3b82f6"}
                        onChange={(e) => {
                          const updated = [...announcementList];
                          updated[idx] = { ...ann, custom_color: e.target.value };
                          setAnnouncementList(updated);
                        }}
                        placeholder="#3b82f6"
                        className="h-8 text-xs flex-1"
                      />
                      <div
                        className="h-8 w-16 rounded border border-input shrink-0"
                        style={{ backgroundColor: ann.custom_color || "#3b82f6" }}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-2xs">Action Label (optional)</Label>
                    <Input
                      value={ann.action_label}
                      onChange={(e) => {
                        const updated = [...announcementList];
                        updated[idx] = { ...ann, action_label: e.target.value };
                        setAnnouncementList(updated);
                      }}
                      placeholder="e.g. Learn More"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-2xs">Action URL (optional)</Label>
                    <Input
                      value={ann.action_url}
                      onChange={(e) => {
                        const updated = [...announcementList];
                        updated[idx] = { ...ann, action_url: e.target.value };
                        setAnnouncementList(updated);
                      }}
                      placeholder="https://..."
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={async () => {
                    setSavingAnnounceIdx(idx);
                    const payload = {
                      message: ann.message,
                      type: ann.type,
                      is_active: ann.is_active,
                      action_label: ann.action_label || null,
                      action_url: ann.action_url || null,
                      custom_color: ann.type === "custom" ? (ann.custom_color || "#3b82f6") : null,
                      updated_at: new Date().toISOString(),
                    };

                    let error;
                    if (ann.id) {
                      const res = await supabase
                        .from('site_announcements')
                        .update(payload)
                        .eq('id', ann.id);
                      error = res.error;
                    } else {
                      const res = await supabase
                        .from('site_announcements')
                        .insert({ ...payload, created_by: 'admin' })
                        .select()
                        .single();
                      if (res.data) {
                        const updated = [...announcementList];
                        updated[idx] = { ...ann, id: res.data.id };
                        setAnnouncementList(updated);
                      }
                      error = res.error;
                    }

                    if (error) {
                      toast({ title: "❌ သိမ်းမရပါ", description: error.message, variant: "destructive" });
                    } else {
                      toast({ title: "✅ Announcement သိမ်းပြီး" });
                    }
                    setSavingAnnounceIdx(null);
                  }}
                  disabled={savingAnnounceIdx === idx || !ann.message.trim()}
                  className="w-full"
                >
                  <Save className="w-3 h-3 mr-1" />
                  {savingAnnounceIdx === idx ? "Saving..." : "Save"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      }
    </div>);

};

export default AdminSettingsTab;