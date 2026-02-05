-- Tighten app_settings access: allow public read ONLY for access_control key
-- Revert overly broad policies added previously.

-- Remove broad policies (if present)
DROP POLICY IF EXISTS "Allow anonymous read access to app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated read access to app_settings" ON public.app_settings;

-- Ensure there's a narrow public policy for access_control
DROP POLICY IF EXISTS "Anyone can view access control" ON public.app_settings;

CREATE POLICY "Anyone can view access control"
ON public.app_settings
FOR SELECT
TO anon, authenticated
USING (key = 'access_control');