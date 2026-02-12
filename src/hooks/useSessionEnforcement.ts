import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Viber-style single device enforcement.
 * When a user logs in on a new device, the old device auto-logs out.
 * 
 * How it works:
 * 1. On login, register the current session ID in profiles.active_session_id
 * 2. Poll every 10 seconds to check if the stored session still matches
 * 3. If mismatch (another device logged in), auto sign-out
 */

export function useSessionEnforcement(userId: string | null, sessionId: string | null) {
  const { toast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isEnforcingRef = useRef(false);

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

    // Start polling every 10 seconds
    intervalRef.current = setInterval(checkSession, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [userId, sessionId, checkSession]);

  return { registerSession };
}
