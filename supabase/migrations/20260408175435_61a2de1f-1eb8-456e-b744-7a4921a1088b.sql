
-- 1. activity_logs: Change admin policies from public to authenticated
DROP POLICY IF EXISTS "Admins can manage all logs" ON public.activity_logs;
CREATE POLICY "Admins can manage all logs"
ON public.activity_logs FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view all logs" ON public.activity_logs;
CREATE POLICY "Admins can view all logs"
ON public.activity_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. user_devices: Change admin policies from public to authenticated
DROP POLICY IF EXISTS "Admins can manage all devices" ON public.user_devices;
CREATE POLICY "Admins can manage all devices"
ON public.user_devices FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view all devices" ON public.user_devices;
CREATE POLICY "Admins can view all devices"
ON public.user_devices FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. credit_topups: Change admin policy from public to authenticated
DROP POLICY IF EXISTS "Admins can view all topups" ON public.credit_topups;
CREATE POLICY "Admins can view all topups"
ON public.credit_topups FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. recap_history: Change admin policy from public to authenticated
DROP POLICY IF EXISTS "Admins can manage all recaps" ON public.recap_history;
CREATE POLICY "Admins can manage all recaps"
ON public.recap_history FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. profiles: Change admin policies from public to authenticated
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. app_settings: Change admin policy from public to authenticated
DROP POLICY IF EXISTS "Admins can manage app settings" ON public.app_settings;
CREATE POLICY "Admins can manage app settings"
ON public.app_settings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Only admins can view all app settings" ON public.app_settings;
CREATE POLICY "Only admins can view all app settings"
ON public.app_settings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 7. app_settings: Restrict access_control from anon+authenticated to authenticated only
DROP POLICY IF EXISTS "Anyone can view access control" ON public.app_settings;
CREATE POLICY "Authenticated users can view access control"
ON public.app_settings FOR SELECT TO authenticated
USING (key = 'access_control'::text);

-- 8. user_roles: Change admin view policy from public to authenticated  
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
