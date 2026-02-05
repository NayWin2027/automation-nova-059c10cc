import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useToolSettings } from './useToolSettings';
import { useToast } from './use-toast';

interface AuthGuardResult {
  isAllowed: boolean;
  isLoading: boolean;
  userPlan: 'free' | 'pro' | 'premium';
  isAuthenticated: boolean;
}

/**
 * Hook that enforces authentication and access control for tool pages.
 * Automatically redirects to login if requireLogin is true and user is not authenticated.
 * Returns loading state, access status, and user info.
 */
export function useAuthGuard(toolId?: string): AuthGuardResult {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading: authLoading, isAuthenticated, getToolUsageCount } = useAuth();
  const { accessControl, canAccessTool, loading: settingsLoading } = useToolSettings();
  const [hasChecked, setHasChecked] = useState(false);

  const isLoading = authLoading || settingsLoading;
  const userPlan = profile?.plan || 'free';

  useEffect(() => {
    // Wait for both auth and settings to load
    if (isLoading) return;
    if (hasChecked) return;

    setHasChecked(true);

    // Check if login is required
    const requireLogin = accessControl.requireLogin && !accessControl.freeMode;

    if (requireLogin && !isAuthenticated) {
      toast({
        title: "🔐 Login Required",
        description: "Tool ကို အသုံးပြုရန် Login ဝင်ပါ",
      });
      navigate('/login', { replace: true });
      return;
    }

    // If toolId provided, check tool-specific access for BOTH authenticated AND guest users
    if (toolId) {
      const effectivelyAuthenticated = isAuthenticated || (!accessControl.requireLogin);
      const isPremium = userPlan === 'premium' || userPlan === 'pro';
      const usageCount = getToolUsageCount(toolId);

      const accessApp = canAccessTool(toolId, effectivelyAuthenticated, isPremium, usageCount, userPlan, 'app');
      const accessOwn = canAccessTool(toolId, effectivelyAuthenticated, isPremium, usageCount, userPlan, 'own');

      const anyAllowed = accessApp.allowed || accessOwn.allowed;

      if (!anyAllowed) {
        const reason = accessApp.reason || accessOwn.reason;
        toast({
          title: "⚠️ Access Denied",
          description: reason,
          variant: "destructive",
        });
        navigate('/', { replace: true });
        return;
      }
    }
  }, [isLoading, isAuthenticated, accessControl, toolId, userPlan, hasChecked, navigate, toast, canAccessTool, getToolUsageCount]);

  // Reset check when user changes
  useEffect(() => {
    setHasChecked(false);
  }, [user?.id]);

  const isAllowed = !isLoading && (
    !accessControl.requireLogin || 
    accessControl.freeMode || 
    isAuthenticated
  );

  return {
    isAllowed,
    isLoading,
    userPlan,
    isAuthenticated,
  };
}
