
-- 1. Add explicit INSERT policy on profiles (defense-in-depth)
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 2. Remove the overly permissive anonymous INSERT policy on promotion_usage_tracking
-- All inserts go through the promotion-tracking edge function using service_role
DROP POLICY IF EXISTS "anon_can_insert_promotion_tracking" ON public.promotion_usage_tracking;
