
-- 1. Drop the unused safe_site_announcements view (fixes SUPA_security_definer_view)
DROP VIEW IF EXISTS public.safe_site_announcements;

-- 2. Remove broad authenticated SELECT on tool_settings base table
DROP POLICY IF EXISTS "Authenticated users can view tool settings" ON public.tool_settings;

-- 3. Retarget admin-only policies from TO public → TO authenticated

-- promotion_usage_tracking: admin update
DROP POLICY IF EXISTS "admins_can_update_promotion_tracking" ON public.promotion_usage_tracking;
CREATE POLICY "admins_can_update_promotion_tracking"
ON public.promotion_usage_tracking FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- admin_totp_secrets: all 4 policies
DROP POLICY IF EXISTS "Admins can view their own TOTP secret" ON public.admin_totp_secrets;
CREATE POLICY "Admins can view their own TOTP secret"
ON public.admin_totp_secrets FOR SELECT
TO authenticated
USING ((auth.uid() = user_id) AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert their own TOTP secret" ON public.admin_totp_secrets;
CREATE POLICY "Admins can insert their own TOTP secret"
ON public.admin_totp_secrets FOR INSERT
TO authenticated
WITH CHECK ((auth.uid() = user_id) AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update their own TOTP secret" ON public.admin_totp_secrets;
CREATE POLICY "Admins can update their own TOTP secret"
ON public.admin_totp_secrets FOR UPDATE
TO authenticated
USING ((auth.uid() = user_id) AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete their own TOTP secret" ON public.admin_totp_secrets;
CREATE POLICY "Admins can delete their own TOTP secret"
ON public.admin_totp_secrets FOR DELETE
TO authenticated
USING ((auth.uid() = user_id) AND has_role(auth.uid(), 'admin'::app_role));

-- user_tool_usage: admin select
DROP POLICY IF EXISTS "Admins can view all usage" ON public.user_tool_usage;
CREATE POLICY "Admins can view all usage"
ON public.user_tool_usage FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- tool_settings: admin-only select (the old "Only admins..." policy was TO public)
DROP POLICY IF EXISTS "Only admins can view all tool settings" ON public.tool_settings;
CREATE POLICY "Only admins can view all tool settings"
ON public.tool_settings FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
