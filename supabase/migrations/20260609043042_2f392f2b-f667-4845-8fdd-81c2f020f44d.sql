
-- 1. Tighten payment_orders INSERT policy: anon must use NULL user_id; authenticated must match their own
DROP POLICY IF EXISTS "Anyone can submit orders" ON public.payment_orders;

CREATE POLICY "Submit orders with ownership binding"
ON public.payment_orders
FOR INSERT
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL)
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

-- 2. Restrict payment-slips uploads to a safe random path; authenticated users must scope under their uid
DROP POLICY IF EXISTS "Anyone can upload payment slips" ON storage.objects;

CREATE POLICY "Scoped payment slip uploads"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-slips'
  AND (
    -- Anonymous uploads must go under 'public/' prefix
    (auth.uid() IS NULL AND name LIKE 'public/%')
    -- Authenticated uploads must be under their own uid folder
    OR (auth.uid() IS NOT NULL AND name LIKE (auth.uid()::text || '/%'))
  )
);

-- 3. Lock credits_expires_at against self-modification on profiles
DROP POLICY IF EXISTS "Users can update safe profile fields only" ON public.profiles;

CREATE POLICY "Users can update safe profile fields only"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND plan = (SELECT p.plan FROM public.profiles p WHERE p.user_id = auth.uid())
  AND credits = (SELECT p.credits FROM public.profiles p WHERE p.user_id = auth.uid())
  AND NOT (credits_started_at IS DISTINCT FROM (SELECT p.credits_started_at FROM public.profiles p WHERE p.user_id = auth.uid()))
  AND NOT (credits_expires_at IS DISTINCT FROM (SELECT p.credits_expires_at FROM public.profiles p WHERE p.user_id = auth.uid()))
  AND is_banned = (SELECT p.is_banned FROM public.profiles p WHERE p.user_id = auth.uid())
  AND NOT (ban_reason IS DISTINCT FROM (SELECT p.ban_reason FROM public.profiles p WHERE p.user_id = auth.uid()))
  AND email = (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid())
  AND NOT (active_session_id IS DISTINCT FROM (SELECT p.active_session_id FROM public.profiles p WHERE p.user_id = auth.uid()))
);
