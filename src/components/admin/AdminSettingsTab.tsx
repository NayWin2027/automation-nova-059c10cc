import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { Settings, Palette, Type, Save, RefreshCw } from "lucide-react";

interface BrandingSettings {
  appName: string;
  title: string;
  subtitle: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
}

interface FeatureSettings {
  maxDevices: number;
  defaultCredits: number;
}

const AdminSettingsTab: React.FC = () => {
  const { toast } = useToast();
  const { getAppSettings, updateAppSettings } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [branding, setBranding] = useState<BrandingSettings>({
    appName: "MyanmarAI Tools",
    title: "AI-Powered Tools",
    subtitle: "Professional Myanmar Language Processing",
    primaryColor: "220 70% 50%",
    backgroundColor: "222 84% 5%",
    textColor: "210 40% 98%",
  });

  const [features, setFeatures] = useState<FeatureSettings>({
    maxDevices: 2,
    defaultCredits: 100,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data, error } = await getAppSettings();
    
    if (!error && data) {
      const brandingData = data.find((s: { key: string }) => s.key === "branding");
      const featuresData = data.find((s: { key: string }) => s.key === "features");
      
      if (brandingData?.value) {
        setBranding(brandingData.value as unknown as BrandingSettings);
      }
      if (featuresData?.value) {
        setFeatures(featuresData.value as unknown as FeatureSettings);
      }
    }
    setLoading(false);
  };

  const handleSaveBranding = async () => {
    setSaving(true);
    const { error } = await updateAppSettings("branding", branding);
    
    if (error) {
      toast({
        title: "❌ Failed to save branding",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ Branding Saved",
        description: "Changes applied successfully",
      });
      
      // Apply changes to CSS variables
      const root = document.documentElement;
      root.style.setProperty("--primary", branding.primaryColor);
      root.style.setProperty("--background", branding.backgroundColor);
      root.style.setProperty("--foreground", branding.textColor);
    }
    setSaving(false);
  };

  const handleSaveFeatures = async () => {
    setSaving(true);
    const { error } = await updateAppSettings("features", features);
    
    if (error) {
      toast({
        title: "❌ Failed to save features",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ Features Saved",
        description: "Changes applied successfully",
      });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Branding Settings */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-cyan-500" />
            Branding & Appearance
          </CardTitle>
          <CardDescription>Customize the app's look and feel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>App Name</Label>
            <Input
              value={branding.appName}
              onChange={(e) => setBranding({ ...branding, appName: e.target.value })}
              placeholder="MyanmarAI Tools"
            />
          </div>

          <div className="space-y-2">
            <Label>Main Title</Label>
            <Input
              value={branding.title}
              onChange={(e) => setBranding({ ...branding, title: e.target.value })}
              placeholder="AI-Powered Tools"
            />
          </div>

          <div className="space-y-2">
            <Label>Subtitle</Label>
            <Input
              value={branding.subtitle}
              onChange={(e) => setBranding({ ...branding, subtitle: e.target.value })}
              placeholder="Professional Myanmar Language Processing"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Primary Color (HSL)</Label>
              <Input
                value={branding.primaryColor}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                placeholder="220 70% 50%"
              />
              <div 
                className="h-8 rounded-md border"
                style={{ backgroundColor: `hsl(${branding.primaryColor})` }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Background (HSL)</Label>
              <Input
                value={branding.backgroundColor}
                onChange={(e) => setBranding({ ...branding, backgroundColor: e.target.value })}
                placeholder="222 84% 5%"
              />
              <div 
                className="h-8 rounded-md border"
                style={{ backgroundColor: `hsl(${branding.backgroundColor})` }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Text Color (HSL)</Label>
              <Input
                value={branding.textColor}
                onChange={(e) => setBranding({ ...branding, textColor: e.target.value })}
                placeholder="210 40% 98%"
              />
              <div 
                className="h-8 rounded-md border"
                style={{ backgroundColor: `hsl(${branding.textColor})` }}
              />
            </div>
          </div>

          <Button
            onClick={handleSaveBranding}
            disabled={saving}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Branding"}
          </Button>
        </CardContent>
      </Card>

      {/* Feature Settings */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-500" />
            Feature Settings
          </CardTitle>
          <CardDescription>Configure app behavior and limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Max Devices per User</Label>
            <Input
              type="number"
              value={features.maxDevices}
              onChange={(e) => setFeatures({ ...features, maxDevices: parseInt(e.target.value) || 2 })}
              min={1}
              max={10}
            />
            <p className="text-xs text-muted-foreground">
              Users exceeding this limit will be auto-banned
            </p>
          </div>

          <div className="space-y-2">
            <Label>Default Credits for New Users</Label>
            <Input
              type="number"
              value={features.defaultCredits}
              onChange={(e) => setFeatures({ ...features, defaultCredits: parseInt(e.target.value) || 100 })}
              min={0}
            />
          </div>

          <Button
            onClick={handleSaveFeatures}
            disabled={saving}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Features"}
          </Button>
        </CardContent>
      </Card>

      {/* Preview Card */}
      <Card className="border-border/50 bg-card/50 md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="w-5 h-5 text-purple-500" />
            Live Preview
          </CardTitle>
          <CardDescription>See how your branding looks</CardDescription>
        </CardHeader>
        <CardContent>
          <div 
            className="p-6 rounded-lg border"
            style={{ backgroundColor: `hsl(${branding.backgroundColor})` }}
          >
            <h1 
              className="text-2xl font-bold mb-2"
              style={{ color: `hsl(${branding.textColor})` }}
            >
              {branding.appName}
            </h1>
            <h2 
              className="text-lg mb-1"
              style={{ color: `hsl(${branding.primaryColor})` }}
            >
              {branding.title}
            </h2>
            <p 
              className="text-sm opacity-70"
              style={{ color: `hsl(${branding.textColor})` }}
            >
              {branding.subtitle}
            </p>
            <button
              className="mt-4 px-4 py-2 rounded-md text-white font-medium"
              style={{ backgroundColor: `hsl(${branding.primaryColor})` }}
            >
              Sample Button
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettingsTab;
