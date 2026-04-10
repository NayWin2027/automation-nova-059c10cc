-- Remove the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view safe tool settings" ON public.tool_settings;

-- Recreate safe_tool_settings view as security definer so it bypasses RLS
-- This way anon users can read through the view but NOT directly query tool_settings
DROP VIEW IF EXISTS public.safe_tool_settings;
CREATE VIEW public.safe_tool_settings
WITH (security_invoker = false)
AS
SELECT id, tool_id, title, description, is_enabled, requires_auth, is_premium
FROM public.tool_settings;

-- Grant SELECT on the view to anon and authenticated
GRANT SELECT ON public.safe_tool_settings TO anon, authenticated;