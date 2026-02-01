import { useToolSettings } from './useToolSettings';
import { useAuth } from './useAuth';

interface ApiAccessResult {
  appApiAllowed: boolean;
  ownApiAllowed: boolean;
  appApiReason?: string;
  ownApiReason?: string;
  anyApiAvailable: boolean;
  defaultApiMode: 'app' | 'own';
  isLoading: boolean;
  isFreeMode: boolean;
}

/**
 * Hook to check which API modes are available for the current user based on admin settings.
 * 
 * Logic:
 * - If ALL toggle is OFF for an API mode, that mode is completely blocked
 * - Individual tier toggles (Premium/Pro/Free) control access per user plan
 * - If at least one API mode is available, the tool can be used
 * - Free Mode: login not required, but App API still blocked for free/guest users
 */
export function useApiAccess(): ApiAccessResult {
  const { accessControl, loading: settingsLoading } = useToolSettings();
  const { profile, isAuthenticated, loading: authLoading } = useAuth();

  const isLoading = settingsLoading || authLoading;
  const isFreeMode = accessControl.freeMode;
  
  // Determine user plan - guest users are treated as 'free'
  const userPlan: 'free' | 'pro' | 'premium' = profile?.plan || 'free';
  const isGuest = !isAuthenticated;

  // Check App API access
  const checkAppApiAccess = (): { allowed: boolean; reason?: string } => {
    const apiAccess = accessControl.appApiAccess;
    
    if (!apiAccess) {
      return { allowed: true };
    }

    // In Free Mode, App API is NOT available for free/guest users
    if (isFreeMode && (isGuest || userPlan === 'free')) {
      return { allowed: false, reason: 'Free Mode တွင် App API မသုံးနိုင်ပါ' };
    }

    // Check plan-specific access
    if (userPlan === 'premium' && apiAccess.premium === false) {
      return { allowed: false, reason: 'Premium users အတွက် App API ပိတ်ထားပါသည်' };
    }
    if (userPlan === 'pro' && apiAccess.pro === false) {
      return { allowed: false, reason: 'Pro users အတွက် App API ပိတ်ထားပါသည်' };
    }
    if (userPlan === 'free' && apiAccess.free === false) {
      return { allowed: false, reason: 'Free users အတွက် App API ပိတ်ထားပါသည်' };
    }

    // Guest users in non-free mode - check free tier setting
    if (isGuest && apiAccess.free === false) {
      return { allowed: false, reason: 'Guest users အတွက် App API ပိတ်ထားပါသည်' };
    }

    return { allowed: true };
  };

  // Check Own API access
  const checkOwnApiAccess = (): { allowed: boolean; reason?: string } => {
    const apiAccess = accessControl.ownApiAccess;
    
    if (!apiAccess) {
      return { allowed: true };
    }

    // Check plan-specific access
    if (userPlan === 'premium' && apiAccess.premium === false) {
      return { allowed: false, reason: 'Premium users အတွက် Own API ပိတ်ထားပါသည်' };
    }
    if (userPlan === 'pro' && apiAccess.pro === false) {
      return { allowed: false, reason: 'Pro users အတွက် Own API ပိတ်ထားပါသည်' };
    }
    if (userPlan === 'free' && apiAccess.free === false) {
      return { allowed: false, reason: 'Free users အတွက် Own API ပိတ်ထားပါသည်' };
    }

    // Guest users - check free tier setting
    if (isGuest && apiAccess.free === false) {
      return { allowed: false, reason: 'Guest users အတွက် Own API ပိတ်ထားပါသည်' };
    }

    return { allowed: true };
  };

  const appApiCheck = checkAppApiAccess();
  const ownApiCheck = checkOwnApiAccess();

  const anyApiAvailable = appApiCheck.allowed || ownApiCheck.allowed;
  
  // Determine default API mode - prefer app if available, otherwise own
  let defaultApiMode: 'app' | 'own' = 'app';
  if (!appApiCheck.allowed && ownApiCheck.allowed) {
    defaultApiMode = 'own';
  } else if (!ownApiCheck.allowed && appApiCheck.allowed) {
    defaultApiMode = 'app';
  }

  return {
    appApiAllowed: appApiCheck.allowed,
    ownApiAllowed: ownApiCheck.allowed,
    appApiReason: appApiCheck.reason,
    ownApiReason: ownApiCheck.reason,
    anyApiAvailable,
    defaultApiMode,
    isLoading,
    isFreeMode,
  };
}
