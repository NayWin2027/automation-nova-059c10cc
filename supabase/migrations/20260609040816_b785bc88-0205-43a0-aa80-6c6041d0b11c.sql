
-- 1) Add admin-override expiry column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credits_expires_at timestamptz;

-- 2) Backfill any NULL credits_started_at using created_at (or now() as fallback)
UPDATE public.profiles
SET credits_started_at = COALESCE(created_at, now())
WHERE credits_started_at IS NULL;

-- 3) Update deduct_user_credits to:
--    - Use credits_expires_at override if present
--    - Otherwise use credits_started_at + 1 month + 7 days
--    - Treat NULL credits_started_at AND NULL credits_expires_at as EXPIRED (close loophole)
CREATE OR REPLACE FUNCTION public.deduct_user_credits(_user_id uuid, _tool_id text, _is_own_api boolean DEFAULT false, _custom_cost integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_plan text;
  _current_credits integer;
  _credit_cost integer;
  _new_balance integer;
  _access_control jsonb;
  _tier_access jsonb;
  _today date := CURRENT_DATE;
  _is_admin boolean;
  _credits_started_at timestamptz;
  _credits_expires_at timestamptz;
  _effective_expiry timestamptz;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = 'admin'::app_role
  ) INTO _is_admin;

  IF _is_admin THEN
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count, success_count)
    VALUES (_user_id, _tool_id, _today, 1, 1)
    ON CONFLICT (user_id, tool_id, usage_date)
    DO UPDATE SET usage_count = user_tool_usage.usage_count + 1, success_count = user_tool_usage.success_count + 1;

    SELECT credits INTO _current_credits FROM public.profiles WHERE user_id = _user_id;

    RETURN json_build_object(
      'success', true,
      'balance', COALESCE(_current_credits, 0),
      'deducted', 0,
      'is_admin', true
    );
  END IF;

  SELECT plan, credits, credits_started_at, credits_expires_at
    INTO _user_plan, _current_credits, _credits_started_at, _credits_expires_at
  FROM public.profiles
  WHERE user_id = _user_id;

  IF _user_plan IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User profile not found',
      'errorCode', 'USER_NOT_FOUND'
    );
  END IF;

  -- Determine effective expiry: admin override wins; else start + 1 month + 7 days grace; else NOW (expired)
  IF _credits_expires_at IS NOT NULL THEN
    _effective_expiry := _credits_expires_at;
  ELSIF _credits_started_at IS NOT NULL THEN
    _effective_expiry := _credits_started_at + INTERVAL '1 month' + INTERVAL '7 days';
  ELSE
    _effective_expiry := now() - INTERVAL '1 second'; -- treat as expired (loophole closed)
  END IF;

  IF _effective_expiry < now() THEN
    UPDATE public.profiles
    SET credits = 0, updated_at = now()
    WHERE user_id = _user_id;

    RETURN json_build_object(
      'success', false,
      'error', 'Credit သက်တမ်းကုန်ဆုံးသွားပါပြီ။ Credit ထပ်ဖြည့်ပါ။',
      'errorCode', 'CREDITS_EXPIRED',
      'balance', 0
    );
  END IF;

  IF _custom_cost IS NOT NULL THEN
    _credit_cost := _custom_cost;
  ELSE
    SELECT COALESCE(credit_cost, 10) INTO _credit_cost
    FROM public.tool_settings
    WHERE tool_id = _tool_id;
    IF _credit_cost IS NULL THEN
      _credit_cost := 10;
    END IF;
  END IF;

  IF _is_own_api THEN
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count, success_count)
    VALUES (_user_id, _tool_id, _today, 1, 1)
    ON CONFLICT (user_id, tool_id, usage_date)
    DO UPDATE SET usage_count = user_tool_usage.usage_count + 1, success_count = user_tool_usage.success_count + 1;

    RETURN json_build_object(
      'success', true,
      'balance', _current_credits,
      'deducted', 0,
      'used_own_api', true
    );
  END IF;

  SELECT value INTO _access_control
  FROM public.app_settings
  WHERE key = 'access_control';

  IF _user_plan = 'free' THEN
    IF _access_control IS NOT NULL AND 
       COALESCE((_access_control->>'blockFreeAppApi')::boolean, false) = true THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Free users များသည် App API သုံးခွင့်မရှိပါ။ Own API Key သုံးပါ။',
        'errorCode', 'FREE_APP_API_BLOCKED',
        'balance', _current_credits
      );
    END IF;

    _tier_access := _access_control->'appApiAccess';
    IF _tier_access IS NOT NULL AND 
       COALESCE((_tier_access->>'free')::boolean, true) = false THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Free tier သည် App API သုံးခွင့်မရှိပါ။',
        'errorCode', 'TIER_ACCESS_DENIED',
        'balance', _current_credits
      );
    END IF;
  END IF;

  IF _credit_cost = 0 THEN
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count, success_count)
    VALUES (_user_id, _tool_id, _today, 1, 1)
    ON CONFLICT (user_id, tool_id, usage_date)
    DO UPDATE SET usage_count = user_tool_usage.usage_count + 1, success_count = user_tool_usage.success_count + 1;

    RETURN json_build_object('success', true, 'balance', _current_credits, 'deducted', 0);
  END IF;

  IF _current_credits < _credit_cost THEN
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count, error_count)
    VALUES (_user_id, _tool_id, _today, 1, 1)
    ON CONFLICT (user_id, tool_id, usage_date)
    DO UPDATE SET usage_count = user_tool_usage.usage_count + 1, error_count = user_tool_usage.error_count + 1;

    RETURN json_build_object(
      'success', false,
      'error', 'Credits မလုံလောက်ပါ။',
      'errorCode', 'INSUFFICIENT_CREDITS',
      'balance', _current_credits,
      'required', _credit_cost
    );
  END IF;

  _new_balance := _current_credits - _credit_cost;

  UPDATE public.profiles
  SET credits = _new_balance, updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count, success_count, deduct_count)
  VALUES (_user_id, _tool_id, _today, 1, 1, 1)
  ON CONFLICT (user_id, tool_id, usage_date)
  DO UPDATE SET usage_count = user_tool_usage.usage_count + 1, success_count = user_tool_usage.success_count + 1, deduct_count = user_tool_usage.deduct_count + 1;

  INSERT INTO public.activity_logs (user_id, tool_name, action, metadata)
  VALUES (
    _user_id, _tool_id, 'credit_deduction',
    jsonb_build_object('credits_deducted', _credit_cost, 'new_balance', _new_balance, 'used_app_key', true)
  );

  RETURN json_build_object('success', true, 'balance', _new_balance, 'deducted', _credit_cost);
END;
$function$;
