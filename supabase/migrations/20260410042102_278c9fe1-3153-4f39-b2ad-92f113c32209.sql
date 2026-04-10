-- Fix 1: Allow anon + authenticated users to read safe_tool_settings view
-- The view only exposes non-sensitive columns (id, tool_id, title, description, is_enabled, requires_auth, is_premium)
CREATE POLICY "Anyone can view safe tool settings"
ON public.tool_settings
FOR SELECT
TO anon, authenticated
USING (true);

-- Fix 2: Allow anon users to read access_control setting (needed to enforce requireLogin gate)
-- Update existing policy to include anon role
DROP POLICY IF EXISTS "Authenticated users can view access control" ON public.app_settings;
CREATE POLICY "Anyone can view access control"
ON public.app_settings
FOR SELECT
TO anon, authenticated
USING (key = 'access_control');