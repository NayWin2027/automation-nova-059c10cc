
-- Expand safe_tool_settings to include client-visible pricing fields
CREATE OR REPLACE VIEW public.safe_tool_settings AS
SELECT id, tool_id, title, description, is_enabled, requires_auth, is_premium,
       credit_cost, server_credit_per_min
FROM public.tool_settings;

GRANT SELECT ON public.safe_tool_settings TO anon, authenticated;

-- Remove broad authenticated SELECT on tool_settings (sensitive fields like tier_limits, daily_free_limit)
DROP POLICY IF EXISTS "Authenticated users can view tool settings" ON public.tool_settings;

-- Deny anonymous UPDATE/DELETE on payment_orders (anon can only INSERT)
CREATE POLICY "Deny anon updates on payment_orders"
ON public.payment_orders
AS RESTRICTIVE
FOR UPDATE
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny anon deletes on payment_orders"
ON public.payment_orders
AS RESTRICTIVE
FOR DELETE
TO anon
USING (false);
