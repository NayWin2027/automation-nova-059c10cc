
-- Fix promotion_usage_tracking: drop broken/overly-permissive policies
DROP POLICY IF EXISTS "users_can_select_own_ip_promotion_tracking" ON public.promotion_usage_tracking;
DROP POLICY IF EXISTS "users_can_update_own_ip_promotion_tracking" ON public.promotion_usage_tracking;

-- Add admin-only UPDATE policy to replace the broken one
CREATE POLICY "admins_can_update_promotion_tracking"
ON public.promotion_usage_tracking
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
