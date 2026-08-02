DROP POLICY "Users can update safe profile fields only" ON public.profiles;

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
  AND NOT (referred_by IS DISTINCT FROM (SELECT p.referred_by FROM public.profiles p WHERE p.user_id = auth.uid()))
  AND NOT (referral_code IS DISTINCT FROM (SELECT p.referral_code FROM public.profiles p WHERE p.user_id = auth.uid()))
  AND referral_reward_claimed = (SELECT p.referral_reward_claimed FROM public.profiles p WHERE p.user_id = auth.uid())
);