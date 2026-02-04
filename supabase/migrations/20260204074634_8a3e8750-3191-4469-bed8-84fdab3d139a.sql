-- Fix Security Definer Views - use security_invoker instead

-- Drop and recreate safe_app_settings with SECURITY INVOKER
DROP VIEW IF EXISTS public.safe_app_settings;
CREATE OR REPLACE VIEW public.safe_app_settings 
WITH (security_invoker = true) AS
SELECT 
  id,
  key,
  updated_at,
  value
FROM public.app_settings
WHERE key IN ('app_name', 'app_subtitle', 'logo_url', 'favicon_url', 'primary_color', 'accent_color', 'contact_email', 'contact_phone', 'discord_url', 'footer_text');

-- Drop and recreate safe_tool_settings with SECURITY INVOKER
DROP VIEW IF EXISTS public.safe_tool_settings;
CREATE OR REPLACE VIEW public.safe_tool_settings 
WITH (security_invoker = true) AS
SELECT 
  id,
  tool_id,
  title,
  description,
  is_enabled,
  requires_auth,
  is_premium
FROM public.tool_settings;

-- Grant access to views
GRANT SELECT ON public.safe_app_settings TO anon;
GRANT SELECT ON public.safe_app_settings TO authenticated;
GRANT SELECT ON public.safe_tool_settings TO anon;
GRANT SELECT ON public.safe_tool_settings TO authenticated;

-- Create RLS policies for app_settings to allow view access to safe keys only
CREATE POLICY "Anyone can view safe app settings"
ON public.app_settings
FOR SELECT
USING (
  key IN ('app_name', 'app_subtitle', 'logo_url', 'favicon_url', 'primary_color', 'accent_color', 'contact_email', 'contact_phone', 'discord_url', 'footer_text')
);

-- Create RLS policy for tool_settings to allow viewing basic info
CREATE POLICY "Anyone can view basic tool settings"
ON public.tool_settings
FOR SELECT
USING (true);