-- Add RLS policy to allow anonymous users to read app_settings
-- This is needed for the Login Required toggle to work for guest users

-- First, check if policy exists and drop it if needed
DROP POLICY IF EXISTS "Allow anonymous read access to app_settings" ON public.app_settings;

-- Create policy for anonymous read access
CREATE POLICY "Allow anonymous read access to app_settings"
ON public.app_settings
FOR SELECT
TO anon
USING (true);

-- Also allow authenticated users to read
DROP POLICY IF EXISTS "Allow authenticated read access to app_settings" ON public.app_settings;

CREATE POLICY "Allow authenticated read access to app_settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);