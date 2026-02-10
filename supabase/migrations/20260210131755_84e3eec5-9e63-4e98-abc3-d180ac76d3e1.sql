
-- Fix promotion_usage_tracking: Remove overly permissive policies
DROP POLICY IF EXISTS "anyone_can_select_promotion_tracking" ON public.promotion_usage_tracking;
DROP POLICY IF EXISTS "anyone_can_update_promotion_tracking" ON public.promotion_usage_tracking;
DROP POLICY IF EXISTS "anyone_can_insert_promotion_tracking" ON public.promotion_usage_tracking;

-- Allow anonymous INSERT only (needed for guest promotion tracking)
-- But restrict what they can insert by not exposing existing data
CREATE POLICY "anon_can_insert_promotion_tracking"
  ON public.promotion_usage_tracking
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only allow SELECT for the user's own device fingerprint (rate limiting check)
-- Since guests don't have auth.uid(), we use a service_role pattern:
-- The edge function checks usage server-side, guests never directly query this table
CREATE POLICY "authenticated_can_select_own_promotion_tracking"
  ON public.promotion_usage_tracking
  FOR SELECT
  TO authenticated
  USING (false);

-- Admins can view all promotion tracking data
CREATE POLICY "admins_can_select_promotion_tracking"
  ON public.promotion_usage_tracking
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update promotion tracking
CREATE POLICY "admins_can_update_promotion_tracking"
  ON public.promotion_usage_tracking
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete promotion tracking
CREATE POLICY "admins_can_delete_promotion_tracking"
  ON public.promotion_usage_tracking
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
