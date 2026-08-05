CREATE TABLE public.referral_reward_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  milestone integer NOT NULL,
  friend_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.referral_reward_requests TO authenticated;
GRANT ALL ON public.referral_reward_requests TO service_role;

ALTER TABLE public.referral_reward_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral requests"
ON public.referral_reward_requests FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update referral requests"
ON public.referral_reward_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete referral requests"
ON public.referral_reward_requests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_referral_reward_requests_updated_at
BEFORE UPDATE ON public.referral_reward_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_referral_reward_requests_status ON public.referral_reward_requests (status, created_at DESC);
CREATE INDEX idx_referral_reward_requests_user ON public.referral_reward_requests (user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_rewards_granted integer NOT NULL DEFAULT 0;

UPDATE public.profiles
SET referral_rewards_granted = 1
WHERE COALESCE(referral_reward_claimed, false) = true
  AND referral_rewards_granted = 0;

-- Request-only claim function (no instant grant)
CREATE OR REPLACE FUNCTION public.claim_referral_reward(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _count int;
  _granted int;
  _eligible int;
  _milestone int;
  _pending_id uuid;
  _req_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT COALESCE(referral_rewards_granted, 0) INTO _granted
  FROM public.profiles WHERE user_id = _user_id;

  IF _granted IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  SELECT COUNT(*)::int INTO _count FROM public.profiles
   WHERE referred_by = _user_id AND COALESCE(is_banned, false) = false;

  _eligible := floor(_count / 5)::int;

  IF _eligible <= _granted THEN
    RETURN json_build_object('success', false, 'error', 'NOT_ENOUGH_FRIENDS', 'count', _count);
  END IF;

  SELECT id INTO _pending_id FROM public.referral_reward_requests
   WHERE user_id = _user_id AND status = 'pending' LIMIT 1;

  IF _pending_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'ALREADY_PENDING', 'count', _count);
  END IF;

  _milestone := (_granted + 1) * 5;

  INSERT INTO public.referral_reward_requests (user_id, milestone, friend_count, status)
  VALUES (_user_id, _milestone, _count, 'pending')
  RETURNING id INTO _req_id;

  INSERT INTO public.activity_logs (user_id, tool_name, action, metadata)
  VALUES (_user_id, 'referral', 'request_reward',
          jsonb_build_object('friends', _count, 'milestone', _milestone, 'request_id', _req_id));

  RETURN json_build_object('success', true, 'pending', true, 'friends', _count, 'milestone', _milestone);
END;
$function$;

-- Admin approve / reject
CREATE OR REPLACE FUNCTION public.approve_referral_reward(_request_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _req public.referral_reward_requests%ROWTYPE;
  _current_expiry timestamptz;
  _new_expiry timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO _req FROM public.referral_reward_requests WHERE id = _request_id;
  IF _req.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;
  IF _req.status <> 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'ALREADY_REVIEWED');
  END IF;

  IF NOT _approve THEN
    UPDATE public.referral_reward_requests
       SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), admin_note = _note
     WHERE id = _request_id;
    RETURN json_build_object('success', true, 'status', 'rejected');
  END IF;

  SELECT credits_expires_at INTO _current_expiry FROM public.profiles WHERE user_id = _req.user_id;
  _new_expiry := GREATEST(COALESCE(_current_expiry, now()), now()) + interval '1 month';

  UPDATE public.profiles
     SET plan = 'premium',
         credits_expires_at = _new_expiry,
         referral_reward_claimed = true,
         referral_rewards_granted = COALESCE(referral_rewards_granted, 0) + 1,
         updated_at = now()
   WHERE user_id = _req.user_id;

  UPDATE public.referral_reward_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), admin_note = _note
   WHERE id = _request_id;

  INSERT INTO public.activity_logs (user_id, tool_name, action, metadata)
  VALUES (_req.user_id, 'referral', 'reward_approved',
          jsonb_build_object('milestone', _req.milestone, 'new_expiry', _new_expiry));

  RETURN json_build_object('success', true, 'status', 'approved', 'new_expiry', _new_expiry);
END;
$function$;