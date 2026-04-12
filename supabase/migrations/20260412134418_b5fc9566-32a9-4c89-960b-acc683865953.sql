
-- Create a secure read-only view for plan_settings
-- This exposes ONLY the plan_settings value to all users (anon + authenticated)
-- without loosening the app_settings base table RLS
CREATE OR REPLACE VIEW public.safe_plan_settings
WITH (security_invoker = false) AS
  SELECT value
  FROM public.app_settings
  WHERE key = 'plan_settings';

-- Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON public.safe_plan_settings TO anon;
GRANT SELECT ON public.safe_plan_settings TO authenticated;
