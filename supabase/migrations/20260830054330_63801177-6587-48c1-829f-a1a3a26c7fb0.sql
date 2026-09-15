CREATE POLICY "Deny anon selects on payment_orders" ON public.payment_orders FOR SELECT TO anon USING (false);
REVOKE SELECT ON public.payment_orders FROM anon;