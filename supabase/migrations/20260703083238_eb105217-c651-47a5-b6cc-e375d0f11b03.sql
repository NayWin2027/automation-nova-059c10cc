
-- 1. Profiles columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_reward_claimed boolean NOT NULL DEFAULT false;

-- 2. Recap history default expiry -> 14 days
ALTER TABLE public.recap_history
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '14 days');

-- 3. Get or create a referral code for the caller
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _new_code text;
  _attempt int := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT referral_code INTO _code FROM public.profiles WHERE user_id = _user_id;
  IF _code IS NOT NULL AND length(_code) > 0 THEN
    RETURN _code;
  END IF;

  LOOP
    _attempt := _attempt + 1;
    _new_code := 'NOVA-' || upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 6));
    BEGIN
      UPDATE public.profiles SET referral_code = _new_code WHERE user_id = _user_id;
      RETURN _new_code;
    EXCEPTION WHEN unique_violation THEN
      IF _attempt > 5 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;

-- 4. Count referred friends (non-banned)
CREATE OR REPLACE FUNCTION public.count_referred_friends(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN 0;
  END IF;
  RETURN (
    SELECT COUNT(*)::int FROM public.profiles
    WHERE referred_by = _user_id AND COALESCE(is_banned, false) = false
  );
END;
$$;

-- 5. Claim referral reward: 5+ friends -> Premium 1 month + bonus credits
CREATE OR REPLACE FUNCTION public.claim_referral_reward(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
  _already_claimed boolean;
  _bonus int := 0;
  _current_expiry timestamptz;
  _new_expiry timestamptz;
  _current_credits int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT referral_reward_claimed, credits_expires_at, credits
    INTO _already_claimed, _current_expiry, _current_credits
  FROM public.profiles WHERE user_id = _user_id;

  IF _already_claimed THEN
    RETURN json_build_object('success', false, 'error', 'ALREADY_CLAIMED');
  END IF;

  SELECT COUNT(*)::int INTO _count FROM public.profiles
   WHERE referred_by = _user_id AND COALESCE(is_banned, false) = false;

  IF _count < 5 THEN
    RETURN json_build_object('success', false, 'error', 'NOT_ENOUGH_FRIENDS', 'count', _count);
  END IF;

  -- Optional bonus credits from app_settings.referral_reward
  BEGIN
    SELECT COALESCE((value->>'amount')::int, 0) INTO _bonus
    FROM public.app_settings WHERE key = 'referral_reward';
  EXCEPTION WHEN OTHERS THEN
    _bonus := 0;
  END;

  _new_expiry := GREATEST(COALESCE(_current_expiry, now()), now()) + interval '30 days';

  UPDATE public.profiles
     SET plan = 'premium',
         credits_expires_at = _new_expiry,
         credits = COALESCE(_current_credits, 0) + COALESCE(_bonus, 0),
         referral_reward_claimed = true,
         updated_at = now()
   WHERE user_id = _user_id;

  INSERT INTO public.activity_logs (user_id, tool_name, action, metadata)
  VALUES (_user_id, 'referral', 'claim_reward',
          jsonb_build_object('friends', _count, 'bonus_credits', _bonus, 'new_expiry', _new_expiry));

  RETURN json_build_object('success', true, 'friends', _count, 'bonus_credits', _bonus, 'new_expiry', _new_expiry);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_referral_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_referred_friends(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward(uuid) TO authenticated;
