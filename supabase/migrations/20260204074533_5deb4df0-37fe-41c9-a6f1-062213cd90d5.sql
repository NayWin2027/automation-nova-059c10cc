-- Security Fix: Restrict app_settings and tool_settings access to admin users only

-- Drop overly permissive policies on app_settings
DROP POLICY IF EXISTS "Anyone can view app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated users can view app settings" ON public.app_settings;

-- Create a view for safe public access (non-sensitive fields only)
CREATE OR REPLACE VIEW public.safe_app_settings AS
SELECT 
  id,
  key,
  updated_at,
  CASE 
    -- Only expose non-sensitive settings publicly
    WHEN key IN ('app_name', 'app_subtitle', 'logo_url', 'favicon_url', 'primary_color', 'accent_color', 'contact_email', 'contact_phone', 'discord_url', 'footer_text') 
    THEN value
    ELSE NULL
  END as value
FROM public.app_settings
WHERE key IN ('app_name', 'app_subtitle', 'logo_url', 'favicon_url', 'primary_color', 'accent_color', 'contact_email', 'contact_phone', 'discord_url', 'footer_text');

-- Grant access to safe view
GRANT SELECT ON public.safe_app_settings TO anon;
GRANT SELECT ON public.safe_app_settings TO authenticated;

-- Create admin-only policy for full app_settings access
CREATE POLICY "Only admins can view all app settings"
ON public.app_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Drop overly permissive policies on tool_settings
DROP POLICY IF EXISTS "Authenticated users can view tool settings" ON public.tool_settings;
DROP POLICY IF EXISTS "Anyone can view tool settings" ON public.tool_settings;

-- Create a safe view for tool_settings (only non-sensitive fields)
CREATE OR REPLACE VIEW public.safe_tool_settings AS
SELECT 
  id,
  tool_id,
  title,
  description,
  is_enabled,
  requires_auth,
  is_premium
FROM public.tool_settings;

-- Grant access to safe view
GRANT SELECT ON public.safe_tool_settings TO anon;
GRANT SELECT ON public.safe_tool_settings TO authenticated;

-- Create admin-only policy for full tool_settings access
CREATE POLICY "Only admins can view all tool settings"
ON public.tool_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Enable leaked password protection is done via Supabase dashboard
-- This migration handles RLS policy security only