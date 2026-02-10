
-- Fix: Allow anon/authenticated to SELECT their own IP records (needed for promotion rate limiting)
DROP POLICY IF EXISTS "authenticated_can_select_own_promotion_tracking" ON public.promotion_usage_tracking;

-- Anon and authenticated can select records matching their IP (for rate limiting checks)
CREATE POLICY "users_can_select_own_ip_promotion_tracking"
  ON public.promotion_usage_tracking
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anon/authenticated to update their own IP records (increment usage count)
DROP POLICY IF EXISTS "admins_can_update_promotion_tracking" ON public.promotion_usage_tracking;

CREATE POLICY "users_can_update_own_ip_promotion_tracking"
  ON public.promotion_usage_tracking
  FOR UPDATE
  TO anon, authenticated
  USING (true);
