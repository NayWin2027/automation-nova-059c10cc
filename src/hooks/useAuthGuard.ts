import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useToolSettings } from './useToolSettings';
import { useToast } from './use-toast';
import { useAdmin } from './useAdmin';

interface AuthGuardResult {
  isAllowed: boolean;
  isLoading: boolean;
  userPlan: 'free' | 'pro' | 'premium';
  isAuthenticated: boolean;
}

/**
 * Hook that enforces authentication and access control for tool pages.
 * Deterministic: derives allowed state from current auth + settings.
 * Redirects once when access is denied.
 */
export function useAuthGuard(toolId?: string): AuthGuardResult {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading: authLoading, isAuthenticated, getToolUsageCount } = useAuth();
  const { accessControl, canAccessTool, loading: settingsLoading } = useToolSettings();
  const { isAdmin } = useAdmin();

  const isLoading = authLoading || settingsLoading;
  const userPlan = profile?.plan || 'free';

  // Deterministic: compute isAllowed purely from current state
  const isAllowed = useMemo(() => {
    if (isLoading) return false;

    // Admins always have access
    if (isAdmin) return true;

    // If toolId provided, check tool-specific access first
    if (toolId) {
      const effectivelyAuthenticated = isAuthenticated || !accessControl.requireLogin;
      const isPremium = userPlan === 'premium';
      const usageCount = getToolUsageCount(toolId);

      const accessApp = canAccessTool(toolId, effectivelyAuthenticated, isPremium, usageCount, userPlan, 'app');
      const accessOwn = canAccessTool(toolId, effectivelyAuthenticated, isPremium, usageCount, userPlan, 'own');

      // If neither mode is allowed, block
      if (!accessApp.allowed && !accessOwn.allowed) return false;

      // If allowed (including promotion mode), permit access
      return true;
    }

    // No toolId: just check login requirement
    const requireLogin = accessControl.requireLogin && !accessControl.freeMode;

    // Promotion Mode ON: allow any user to access tool pages
    if (accessControl.promotionMode) return true;

    // If login is required and user is not authenticated → not allowed
    if (requireLogin && !isAuthenticated) return false;

    return true;
  }, [isLoading, isAuthenticated, isAdmin, accessControl, toolId, userPlan, canAccessTool, getToolUsageCount]);

  // Redirect effect: only fires when not loading and not allowed
  useEffect(() => {
    if (isLoading) return;
    if (isAllowed) return;

    const requireLogin = accessControl.requireLogin && !accessControl.freeMode;

    if (requireLogin && !isAuthenticated) {
      toast({
        title: "🔐 Login Required",
        description: "Tool ကို အသုံးပြုရန် Login ဝင်ပါ",
      });
      navigate('/login', { replace: true });
      return;
    }

    // Tool-specific denial
    if (toolId) {
      const effectivelyAuthenticated = isAuthenticated || !accessControl.requireLogin;
      const isPremium = userPlan === 'premium' || userPlan === 'pro';
      const usageCount = getToolUsageCount(toolId);
      const accessApp = canAccessTool(toolId, effectivelyAuthenticated, isPremium, usageCount, userPlan, 'app');
      const accessOwn = canAccessTool(toolId, effectivelyAuthenticated, isPremium, usageCount, userPlan, 'own');
      const reason = accessApp.reason || accessOwn.reason;

      toast({
        title: "⚠️ Access Denied",
        description: reason,
        variant: "destructive",
      });
      navigate('/', { replace: true });
    }
  }, [isLoading, isAllowed, isAuthenticated, accessControl, toolId, userPlan, navigate, toast, canAccessTool, getToolUsageCount]);

  return {
    isAllowed,
    isLoading,
    userPlan,
    isAuthenticated,
  };
}
