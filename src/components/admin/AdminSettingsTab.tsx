import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Settings, Palette, Save, RefreshCw, Lock, Unlock, Crown,
  Zap, Edit3, Gift
} from "lucide-react";

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

interface AccessControl {
  requireLogin: boolean;
  freeMode: boolean;
  promotionMode: boolean;
  promotionDailyLimit: number;
  promotionToolCount: number;
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
}

const AdminSettingsTab: React.FC = () => {
  const { toast } = useToast();
  const { getAppSettings, updateAppSettings } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'access' | 'branding' | 'tools'>('access');

  const [branding, setBranding] = useState<BrandingSettings>({
    appName: "MediaMaster",
    title: "AI-Powered Tools",
    subtitle: "Pro Edition V8.0",
    primaryColor: "199 89% 48%",
    backgroundColor: "222 47% 6%",
    textColor: "210 20% 92%",
    accentColor: "199 89% 48%",
    fontFamily: "Inter",
  });

  const [features, setFeatures] = useState<FeatureSettings>({
    maxDevices: 2,
    defaultCredits: 100,
  });

  const [accessControl, setAccessControl] = useState<AccessControl>({
    requireLogin: true,
    freeMode: false,
    promotionMode: false,
    promotionDailyLimit: 3,
    promotionToolCount: 3,
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
      const brandingData = data.find((s: { key: string }) => s.key === "branding");
      const featuresData = data.find((s: { key: string }) => s.key === "features");
      const accessData = data.find((s: { key: string }) => s.key === "access_control");
      
      if (brandingData?.value) {
        setBranding(brandingData.value as unknown as BrandingSettings);
      }
      if (featuresData?.value) {
        setFeatures(featuresData.value as unknown as FeatureSettings);
      }
      if (accessData?.value) {
        setAccessControl(accessData.value as unknown as AccessControl);
      }
    }

    // Load tool settings
    const { data: tools } = await supabase
      .from('tool_settings')
      .select('*')
      .order('tool_id');
    
    if (tools) {
      setToolSettings(tools as ToolSetting[]);
    }

    setLoading(false);
  };

  const handleSaveAccessControl = async () => {
    setSaving(true);
    const { error } = await updateAppSettings("access_control", accessControl);
    
    if (error) {
      toast({
        title: "❌ သိမ်းမရပါ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ Access Control သိမ်းပြီး",
        description: "ပြောင်းလဲမှုများ အသက်ဝင်ပါပြီ",
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
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ Branding သိမ်းပြီး",
        description: "ပြောင်းလဲမှုများ အသက်ဝင်ပါပြီ",
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
    const { error } = await supabase
      .from('tool_settings')
      .update({
        title: tool.title,
        description: tool.description,
        is_enabled: tool.is_enabled,
        requires_auth: tool.requires_auth,
        is_premium: tool.is_premium,
        daily_free_limit: tool.daily_free_limit,
        credit_cost: tool.credit_cost,
      })
      .eq('id', tool.id);

    if (error) {
      toast({
        title: "❌ Tool သိမ်းမရပါ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ Tool သိမ်းပြီး",
        description: `${tool.title} အပြောင်းအလဲများ အသက်ဝင်ပါပြီ`,
      });
      setEditingTool(null);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-1 p-0.5 bg-secondary/30 rounded-lg w-fit">
        <button
          onClick={() => setActiveSection('access')}
          className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors ${
            activeSection === 'access' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Lock className="w-3 h-3 inline mr-1" />
          Access Control
        </button>
        <button
          onClick={() => setActiveSection('tools')}
          className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors ${
            activeSection === 'tools' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Edit3 className="w-3 h-3 inline mr-1" />
          Tool Settings
        </button>
        <button
          onClick={() => setActiveSection('branding')}
          className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors ${
            activeSection === 'branding' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Palette className="w-3 h-3 inline mr-1" />
          Branding
        </button>
      </div>

      {/* Access Control Section */}
      {activeSection === 'access' && (
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
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Login Required</Label>
                  <p className="text-2xs text-muted-foreground">Tools သုံးရန် Login လိုအပ်မလား</p>
                </div>
                <Switch
                  checked={accessControl.requireLogin}
                  onCheckedChange={(checked) => setAccessControl({ ...accessControl, requireLogin: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Unlock className="w-3 h-3 text-green-500" />
                    Free Mode
                  </Label>
                  <p className="text-2xs text-muted-foreground">Tools အားလုံး Free ဖြစ်မယ်</p>
                </div>
                <Switch
                  checked={accessControl.freeMode}
                  onCheckedChange={(checked) => setAccessControl({ ...accessControl, freeMode: checked })}
                />
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
                <Switch
                  checked={accessControl.promotionMode}
                  onCheckedChange={(checked) => setAccessControl({ ...accessControl, promotionMode: checked })}
                />
              </div>

              {accessControl.promotionMode && (
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
                      className="h-8 text-xs"
                    />
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
                      className="h-8 text-xs"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="md:col-span-2">
            <Button
              onClick={handleSaveAccessControl}
              disabled={saving}
              className="bg-gradient-to-r from-cyan-500 to-blue-600"
            >
              <Save className="w-3 h-3 mr-1" />
              {saving ? "Saving..." : "Save Access Control"}
            </Button>
          </div>
        </div>
      )}

      {/* Tool Settings Section */}
      {activeSection === 'tools' && (
        <div className="space-y-2">
          {toolSettings.map((tool) => (
            <Card key={tool.id} className="border-border/50 bg-card/50">
              <CardContent className="p-3">
                {editingTool === tool.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-2xs">Title</Label>
                        <Input
                          value={tool.title}
                          onChange={(e) => setToolSettings(prev => 
                            prev.map(t => t.id === tool.id ? { ...t, title: e.target.value } : t)
                          )}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-2xs">Daily Limit</Label>
                        <Input
                          type="number"
                          value={tool.daily_free_limit}
                          onChange={(e) => setToolSettings(prev => 
                            prev.map(t => t.id === tool.id ? { ...t, daily_free_limit: parseInt(e.target.value) || 0 } : t)
                          )}
                          className="h-7 text-xs"
                          min={0}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-2xs">💳 Credit Cost</Label>
                        <Input
                          type="number"
                          value={tool.credit_cost || 10}
                          onChange={(e) => setToolSettings(prev => 
                            prev.map(t => t.id === tool.id ? { ...t, credit_cost: parseInt(e.target.value) || 10 } : t)
                          )}
                          className="h-7 text-xs"
                          min={0}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-2xs">Description</Label>
                      <Input
                        value={tool.description}
                        onChange={(e) => setToolSettings(prev => 
                          prev.map(t => t.id === tool.id ? { ...t, description: e.target.value } : t)
                        )}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tool.is_enabled}
                          onCheckedChange={(checked) => setToolSettings(prev => 
                            prev.map(t => t.id === tool.id ? { ...t, is_enabled: checked } : t)
                          )}
                        />
                        <span className="text-2xs">Enabled</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tool.requires_auth}
                          onCheckedChange={(checked) => setToolSettings(prev => 
                            prev.map(t => t.id === tool.id ? { ...t, requires_auth: checked } : t)
                          )}
                        />
                        <span className="text-2xs">Auth Required</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tool.is_premium}
                          onCheckedChange={(checked) => setToolSettings(prev => 
                            prev.map(t => t.id === tool.id ? { ...t, is_premium: checked } : t)
                          )}
                        />
                        <span className="text-2xs">Premium Only</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUpdateTool(tool)}
                        disabled={saving}
                        className="h-7 text-2xs bg-gradient-to-r from-cyan-500 to-blue-600"
                      >
                        <Save className="w-3 h-3 mr-1" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTool(null)}
                        className="h-7 text-2xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
                        tool.is_enabled ? 'bg-primary/20' : 'bg-muted'
                      }`}>
                        <Zap className={`w-4 h-4 ${tool.is_enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-medium">{tool.title}</h4>
                          {tool.is_premium && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-3xs flex items-center gap-0.5">
                              <Crown className="w-2 h-2" />
                              PRO
                            </span>
                          )}
                          {!tool.is_enabled && (
                            <span className="px-1.5 py-0.5 rounded bg-destructive/20 text-destructive text-3xs">OFF</span>
                          )}
                        </div>
                        <p className="text-2xs text-muted-foreground">{tool.description}</p>
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
                      className="h-7 text-2xs"
                    >
                      <Edit3 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Branding Section */}
      {activeSection === 'branding' && (
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
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-2xs">Subtitle</Label>
                <Input
                  value={branding.subtitle}
                  onChange={(e) => setBranding({ ...branding, subtitle: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-2xs">Primary (HSL)</Label>
                <Input
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  className="h-7 text-2xs"
                />
                <div 
                  className="h-6 rounded border"
                  style={{ backgroundColor: `hsl(${branding.primaryColor})` }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-2xs">Background (HSL)</Label>
                <Input
                  value={branding.backgroundColor}
                  onChange={(e) => setBranding({ ...branding, backgroundColor: e.target.value })}
                  className="h-7 text-2xs"
                />
                <div 
                  className="h-6 rounded border"
                  style={{ backgroundColor: `hsl(${branding.backgroundColor})` }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-2xs">Text (HSL)</Label>
                <Input
                  value={branding.textColor}
                  onChange={(e) => setBranding({ ...branding, textColor: e.target.value })}
                  className="h-7 text-2xs"
                />
                <div 
                  className="h-6 rounded border"
                  style={{ backgroundColor: `hsl(${branding.textColor})` }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-2xs">Accent (HSL)</Label>
                <Input
                  value={branding.accentColor || branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                  className="h-7 text-2xs"
                />
                <div 
                  className="h-6 rounded border"
                  style={{ backgroundColor: `hsl(${branding.accentColor || branding.primaryColor})` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-2xs">🔤 Font Family</Label>
                <Input
                  value={branding.fontFamily || "Inter"}
                  onChange={(e) => setBranding({ ...branding, fontFamily: e.target.value })}
                  placeholder="Inter, Roboto, Poppins..."
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-2xs">📝 Title</Label>
                <Input
                  value={branding.title}
                  onChange={(e) => setBranding({ ...branding, title: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <Button
              onClick={handleSaveBranding}
              disabled={saving}
              className="bg-gradient-to-r from-purple-500 to-pink-600"
            >
              <Save className="w-3 h-3 mr-1" />
              {saving ? "Saving..." : "Save Branding"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminSettingsTab;
