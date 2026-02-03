-- Fix the deduct_user_credits function with proper date casting
CREATE OR REPLACE FUNCTION public.deduct_user_credits(
  _user_id uuid,
  _tool_id text,
  _is_own_api boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_plan text;
  _current_credits integer;
  _credit_cost integer;
  _new_balance integer;
  _access_control jsonb;
  _tier_access jsonb;
  _today date := CURRENT_DATE;
BEGIN
  -- Get user profile
  SELECT plan, credits INTO _user_plan, _current_credits
  FROM public.profiles
  WHERE user_id = _user_id;

  IF _user_plan IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User profile not found',
      'errorCode', 'USER_NOT_FOUND'
    );
  END IF;

  -- Get tool credit cost
  SELECT COALESCE(credit_cost, 10) INTO _credit_cost
  FROM public.tool_settings
  WHERE tool_id = _tool_id;

  IF _credit_cost IS NULL THEN
    _credit_cost := 10;
  END IF;

  -- If using own API key, skip credit deduction but log usage
  IF _is_own_api THEN
    -- Update daily usage count with proper date casting
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count)
    VALUES (_user_id, _tool_id, _today, 1)
    ON CONFLICT (user_id, tool_id, usage_date)
    DO UPDATE SET usage_count = user_tool_usage.usage_count + 1;

    RETURN json_build_object(
      'success', true,
      'balance', _current_credits,
      'deducted', 0,
      'used_own_api', true
    );
  END IF;

  -- Get access control settings
  SELECT value INTO _access_control
  FROM public.app_settings
  WHERE key = 'access_control';

  -- Check if free users are blocked from app API
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

    -- Check tier-specific access
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

  -- Premium users don't lose credits
  IF _user_plan = 'premium' THEN
    -- Log usage for premium users too
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count)
    VALUES (_user_id, _tool_id, _today, 1)
    ON CONFLICT (user_id, tool_id, usage_date)
    DO UPDATE SET usage_count = user_tool_usage.usage_count + 1;

    RETURN json_build_object(
      'success', true,
      'balance', _current_credits,
      'deducted', 0,
      'is_premium', true
    );
  END IF;

  -- Check if user has enough credits
  IF _current_credits < _credit_cost THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Credits မလုံလောက်ပါ။',
      'errorCode', 'INSUFFICIENT_CREDITS',
      'balance', _current_credits,
      'required', _credit_cost
    );
  END IF;

  -- Deduct credits
  _new_balance := _current_credits - _credit_cost;
  
  UPDATE public.profiles
  SET credits = _new_balance, updated_at = now()
  WHERE user_id = _user_id;

  -- Log usage with proper date type
  INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count)
  VALUES (_user_id, _tool_id, _today, 1)
  ON CONFLICT (user_id, tool_id, usage_date)
  DO UPDATE SET usage_count = user_tool_usage.usage_count + 1;

  -- Log activity
  INSERT INTO public.activity_logs (user_id, tool_name, action, metadata)
  VALUES (
    _user_id,
    _tool_id,
    'credit_deduction',
    jsonb_build_object(
      'credits_deducted', _credit_cost,
      'new_balance', _new_balance,
      'used_app_key', true
    )
  );

  RETURN json_build_object(
    'success', true,
    'balance', _new_balance,
    'deducted', _credit_cost
  );
END;
$$;