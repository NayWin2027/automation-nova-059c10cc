-- Tighten access_control visibility: require authentication (was anon+authenticated)
DROP POLICY IF EXISTS "Anyone can view access control" ON public.app_settings;

CREATE POLICY "Authenticated can view access control"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (key = 'access_control');

-- Allow authenticated non-admin users to read tool settings so the UI can show
-- credit costs, daily limits and enabled status. Sensitive admin-only management
-- is still gated by the existing admin policy (FOR ALL).
CREATE POLICY "Authenticated users can view tool settings"
  ON public.tool_settings
  FOR SELECT
  TO authenticated
  USING (true);
