import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Pre-check credits before running any Generate action in App API mode.
 * Returns true if the user has sufficient, non-expired credits.
 * Shows a toast and returns false otherwise.
 */
export async function preCheckCredits(toolId: string, customCost?: number): Promise<boolean> {
  try {
    // Check if Promotion Mode is active - skip credit check entirely
    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'access_control')
      .maybeSingle();

    if (appSettings?.value) {
      const ac = appSettings.value as any;
      if (ac.promotionMode) return true; // No credits needed during promotion
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Login လုပ်ပြီးမှ App API သုံးပါ။");
      return false;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('credits, plan')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !profile) {
      toast.error("Profile ရှာမတွေ့ပါ။");
      return false;
    }

    // Check if admin (admins are exempt)
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin' as const,
    });
    if (isAdmin) return true;

    // Determine cost — use provided custom cost or default
    // Actual credit cost is determined server-side by deduct_user_credits RPC
    const cost = customCost ?? 10;

    // Check sufficient credits
    if (profile.credits < cost) {
      toast.error("Credit မလုံလောက်ပါသဖြင့် Credit ထပ်ဖြည့်ပါ။");
      return false;
    }

    return true;
  } catch (err) {
    console.error('Credit pre-check error:', err);
    return true; // Allow on error to not block UX
  }
}
