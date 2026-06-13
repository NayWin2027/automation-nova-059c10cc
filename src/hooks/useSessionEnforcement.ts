import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Viber-style single device enforcement.
 * Uses a STABLE per-device ID stored in localStorage so token rotation
 * (refresh_token changes on auto-refresh) does NOT cause spurious logouts.
 * Only a real login on another device overwrites profiles.active_session_id,
 * which then triggers logout on this device on the next poll.
 */

const DEVICE_ID_KEY = 'an_device_session_id';

export function getDeviceSessionId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

export function useSessionEnforcement(userId: string | null, _sessionId?: string | null) {
  const { toast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isEnforcingRef = useRef(false);
  const sessionId = userId ? getDeviceSessionId() : null;

  // Register current session as the active one
  const registerSession = useCallback(async () => {
    if (!userId || !sessionId) return;
    try {
      await supabase.rpc('register_active_session', {
        _user_id: userId,
        _session_id: sessionId,
      });
    } catch (e) {
      console.error('Failed to register session:', e);
    }
  }, [userId, sessionId]);

  // Check if current session is still the active one
  const checkSession = useCallback(async () => {
    if (!userId || !sessionId || isEnforcingRef.current) return;

    try {
      const { data, error } = await supabase.rpc('check_active_session', {
        _user_id: userId,
        _session_id: sessionId,
      });

      if (error) {
        console.error('Session check error:', error);
        return;
      }

      // data === false means another device took over
      if (data === false) {
        isEnforcingRef.current = true;
        
        // Stop polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        toast({
          title: '⚠️ Session Expired',
          description: 'အခြား Device တစ်ခုမှ Login ၀င်သွားပါပြီ။ ဤ Device မှ Auto Logout ဖြစ်သွားပါပြီ။',
          variant: 'destructive',
          duration: 5000,
        });

        // Sign out after a brief delay so user sees the toast
        setTimeout(async () => {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // Silent
          }
          window.location.href = '/login';
        }, 2000);
      }
    } catch (e) {
      console.error('Session enforcement error:', e);
    }
  }, [userId, sessionId, toast]);

  useEffect(() => {
    if (!userId || !sessionId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Poll every 30 seconds (less aggressive; device ID is stable)
    intervalRef.current = setInterval(checkSession, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [userId, sessionId, checkSession]);

  return { registerSession };
}
