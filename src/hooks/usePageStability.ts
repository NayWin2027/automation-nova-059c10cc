 import { useEffect, useRef, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 
 /**
  * usePageStability - Prevents app crashes/reloads during processing on desktop
  * 
  * This hook handles:
  * 1. Page visibility changes (tab switching, window minimizing)
  * 2. Auth session keep-alive during long operations
  * 3. Prevents state reset from auth token refresh
  */
 export function usePageStability(isProcessing: boolean = false) {
   const sessionRefreshInterval = useRef<number | null>(null);
   const lastRefreshTime = useRef<number>(Date.now());
   const visibilityState = useRef<string>('visible');
 
   // Keep session alive during processing
   const refreshSession = useCallback(async () => {
     // Only refresh if enough time has passed (5 minutes minimum)
     const now = Date.now();
     const minInterval = 5 * 60 * 1000; // 5 minutes
     
     if (now - lastRefreshTime.current < minInterval) {
       return;
     }
 
     try {
       const { error } = await supabase.auth.refreshSession();
       if (!error) {
         lastRefreshTime.current = now;
         console.log('[PageStability] Session refreshed silently');
       }
     } catch (err) {
       // Silent fail - don't interrupt the user
       console.log('[PageStability] Session refresh skipped:', err);
     }
   }, []);
 
   // Handle visibility changes
   useEffect(() => {
     const handleVisibilityChange = () => {
       const newState = document.visibilityState;
       const wasHidden = visibilityState.current === 'hidden';
       visibilityState.current = newState;
 
       console.log('[PageStability] Visibility changed:', newState);
 
       // When tab becomes visible again after being hidden
       if (newState === 'visible' && wasHidden) {
         // Refresh session silently to prevent 401 errors
         refreshSession();
       }
     };
 
     document.addEventListener('visibilitychange', handleVisibilityChange);
     
     return () => {
       document.removeEventListener('visibilitychange', handleVisibilityChange);
     };
   }, [refreshSession]);
 
   // Keep session alive during processing
   useEffect(() => {
     if (isProcessing) {
       // Refresh immediately when processing starts
       refreshSession();
       
       // Then refresh every 3 minutes during processing
       sessionRefreshInterval.current = window.setInterval(() => {
         refreshSession();
       }, 3 * 60 * 1000);
 
       console.log('[PageStability] Processing started - keep-alive active');
     } else {
       // Clear interval when processing ends
       if (sessionRefreshInterval.current) {
         clearInterval(sessionRefreshInterval.current);
         sessionRefreshInterval.current = null;
         console.log('[PageStability] Processing ended - keep-alive cleared');
       }
     }
 
     return () => {
       if (sessionRefreshInterval.current) {
         clearInterval(sessionRefreshInterval.current);
         sessionRefreshInterval.current = null;
       }
     };
   }, [isProcessing, refreshSession]);
 
   // Prevent page unload during processing
   useEffect(() => {
     const handleBeforeUnload = (e: BeforeUnloadEvent) => {
       if (isProcessing) {
         e.preventDefault();
         e.returnValue = 'Processing in progress. Are you sure you want to leave?';
         return e.returnValue;
       }
     };
 
     window.addEventListener('beforeunload', handleBeforeUnload);
     
     return () => {
       window.removeEventListener('beforeunload', handleBeforeUnload);
     };
   }, [isProcessing]);
 
   return {
     isVisible: visibilityState.current === 'visible',
     refreshSession,
   };
 }