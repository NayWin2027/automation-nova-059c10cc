
-- Replace the existing UPDATE policy with one that also protects active_session_id
DROP POLICY IF EXISTS "Users can update safe profile fields only" ON public.profiles;

CREATE POLICY "Users can update safe profile fields only"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  (auth.uid() = user_id)
  AND (plan = (SELECT p.plan FROM profiles p WHERE p.user_id = auth.uid()))
  AND (credits = (SELECT p.credits FROM profiles p WHERE p.user_id = auth.uid()))
  AND (NOT (credits_started_at IS DISTINCT FROM (SELECT p.credits_started_at FROM profiles p WHERE p.user_id = auth.uid())))
  AND (is_banned = (SELECT p.is_banned FROM profiles p WHERE p.user_id = auth.uid()))
  AND (NOT (ban_reason IS DISTINCT FROM (SELECT p.ban_reason FROM profiles p WHERE p.user_id = auth.uid())))
  AND (email = (SELECT p.email FROM profiles p WHERE p.user_id = auth.uid()))
  AND (NOT (active_session_id IS DISTINCT FROM (SELECT p.active_session_id FROM profiles p WHERE p.user_id = auth.uid())))
);
