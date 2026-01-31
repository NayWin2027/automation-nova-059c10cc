import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BrandingSettings {
  appName: string;
  title: string;
  subtitle: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor?: string;
  fontFamily?: string;
  logoUrl?: string;
}

const DEFAULT_BRANDING: BrandingSettings = {
  appName: "MediaMaster",
  title: "AI-Powered Tools",
  subtitle: "Pro Edition V8.0",
  primaryColor: "199 89% 48%",
  backgroundColor: "222 47% 6%",
  textColor: "210 20% 92%",
  accentColor: "199 89% 48%",
  fontFamily: "Inter",
};

export function useBranding() {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'branding')
        .maybeSingle();

      if (!error && data?.value) {
        const settings = data.value as unknown as BrandingSettings;
        setBranding({ ...DEFAULT_BRANDING, ...settings });
        applyBrandingToCSS({ ...DEFAULT_BRANDING, ...settings });
      }
    } catch (err) {
      console.error('Error fetching branding:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyBrandingToCSS = useCallback((settings: BrandingSettings) => {
    const root = document.documentElement;
    
    if (settings.primaryColor) {
      root.style.setProperty('--primary', settings.primaryColor);
      root.style.setProperty('--accent', settings.primaryColor);
      root.style.setProperty('--ring', settings.primaryColor);
    }
    
    if (settings.backgroundColor) {
      root.style.setProperty('--background', settings.backgroundColor);
    }
    
    if (settings.textColor) {
      root.style.setProperty('--foreground', settings.textColor);
    }

    if (settings.accentColor) {
      root.style.setProperty('--accent', settings.accentColor);
    }

    if (settings.fontFamily) {
      root.style.setProperty('--font-family', settings.fontFamily);
      document.body.style.fontFamily = `'${settings.fontFamily}', sans-serif`;
    }
  }, []);

  useEffect(() => {
    fetchBranding();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('branding-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_settings',
          filter: 'key=eq.branding'
        },
        (payload) => {
          if (payload.new?.value) {
            const newSettings = payload.new.value as unknown as BrandingSettings;
            setBranding({ ...DEFAULT_BRANDING, ...newSettings });
            applyBrandingToCSS({ ...DEFAULT_BRANDING, ...newSettings });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBranding, applyBrandingToCSS]);

  return {
    branding,
    loading,
    refreshBranding: fetchBranding,
    applyBrandingToCSS,
  };
}
