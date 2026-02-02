-- Enhanced credit deduction function with App API access control for Free users
-- This function checks admin settings and blocks Free users from App API if configured

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
  _credit_cost integer;
  _current_credits integer;
  _new_balance integer;
  _user_plan subscription_plan;
  _access_control json;
  _block_free_app_api boolean;
  _app_api_access json;
  _today text;
  _existing_usage_id uuid;
  _current_count integer;
BEGIN
  -- Skip deduction if using own API key (Own API users bypass all restrictions)
  IF _is_own_api THEN
    -- Still track usage for own API
    _today := to_char(CURRENT_DATE, 'YYYY-MM-DD');
    
    SELECT id, usage_count INTO _existing_usage_id, _current_count
    FROM public.user_tool_usage
    WHERE user_id = _user_id AND tool_id = _tool_id AND usage_date = _today;
    
    IF _existing_usage_id IS NOT NULL THEN
      UPDATE public.user_tool_usage SET usage_count = COALESCE(_current_count, 0) + 1 WHERE id = _existing_usage_id;
    ELSE
      INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count) VALUES (_user_id, _tool_id, _today, 1);
    END IF;
    
    RETURN json_build_object('success', true, 'skipped', true, 'reason', 'using_own_api');
  END IF;

  -- Get user's plan first
  SELECT plan INTO _user_plan
  FROM public.profiles
  WHERE user_id = _user_id;

  IF _user_plan IS NULL THEN
    _user_plan := 'free'; -- Default to free if no profile
  END IF;

  -- Get access control settings from app_settings
  SELECT value INTO _access_control
  FROM public.app_settings
  WHERE key = 'access_control';

  -- Check if Free users are blocked from App API
  IF _access_control IS NOT NULL THEN
    _block_free_app_api := COALESCE((_access_control->>'blockFreeAppApi')::boolean, true);
    _app_api_access := _access_control->'appApiAccess';
    
    -- Block Free users from App API if setting is enabled
    IF _user_plan = 'free' AND _block_free_app_api THEN
      RETURN json_build_object(
        'success', false, 
        'error', 'Free users များသည် App API သုံးခွင့်မရှိပါ။ Own API ကိုသာ သုံးနိုင်ပါသည်။',
        'errorCode', 'FREE_APP_API_BLOCKED',
        'balance', 0
      );
    END IF;
    
    -- Check tier-specific App API access
    IF _app_api_access IS NOT NULL THEN
      IF _user_plan = 'free' AND (_app_api_access->>'free')::boolean = false THEN
        RETURN json_build_object(
          'success', false, 
          'error', 'Free users အတွက် App API ပိတ်ထားပါသည်',
          'errorCode', 'TIER_APP_API_BLOCKED',
          'balance', 0
        );
      END IF;
      
      IF _user_plan = 'pro' AND (_app_api_access->>'pro')::boolean = false THEN
        RETURN json_build_object(
          'success', false, 
          'error', 'Pro users အတွက် App API ပိတ်ထားပါသည်',
          'errorCode', 'TIER_APP_API_BLOCKED',
          'balance', 0
        );
      END IF;
    END IF;
  END IF;

  -- Get tool credit cost
  SELECT COALESCE(credit_cost, 10) INTO _credit_cost
  FROM public.tool_settings
  WHERE tool_id = _tool_id;

  IF _credit_cost IS NULL THEN
    _credit_cost := 10; -- Default cost
  END IF;

  -- Get user's current credits (with row lock)
  SELECT credits INTO _current_credits
  FROM public.profiles
  WHERE user_id = _user_id
  FOR UPDATE;

  IF _current_credits IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User profile not found');
  END IF;

  -- Premium users don't lose credits
  IF _user_plan = 'premium' THEN
    -- Track usage for premium users too
    _today := to_char(CURRENT_DATE, 'YYYY-MM-DD');
    
    SELECT id, usage_count INTO _existing_usage_id, _current_count
    FROM public.user_tool_usage
    WHERE user_id = _user_id AND tool_id = _tool_id AND usage_date = _today;
    
    IF _existing_usage_id IS NOT NULL THEN
      UPDATE public.user_tool_usage SET usage_count = COALESCE(_current_count, 0) + 1 WHERE id = _existing_usage_id;
    ELSE
      INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count) VALUES (_user_id, _tool_id, _today, 1);
    END IF;
    
    RETURN json_build_object('success', true, 'skipped', true, 'reason', 'premium_user', 'balance', _current_credits);
  END IF;

  -- Check if user has enough credits
  IF _current_credits < _credit_cost THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Credits မလုံလောက်ပါ',
      'errorCode', 'INSUFFICIENT_CREDITS',
      'required', _credit_cost,
      'balance', _current_credits
    );
  END IF;

  -- Deduct credits
  _new_balance := _current_credits - _credit_cost;
  
  UPDATE public.profiles
  SET credits = _new_balance, updated_at = now()
  WHERE user_id = _user_id;

  -- Log the activity
  INSERT INTO public.activity_logs (user_id, tool_name, action, metadata)
  VALUES (_user_id, _tool_id, 'credit_deduction', json_build_object(
    'credits_deducted', _credit_cost,
    'new_balance', _new_balance,
    'used_app_key', true
  ));

  -- Track daily usage
  _today := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  
  SELECT id, usage_count INTO _existing_usage_id, _current_count
  FROM public.user_tool_usage
  WHERE user_id = _user_id AND tool_id = _tool_id AND usage_date = _today;
  
  IF _existing_usage_id IS NOT NULL THEN
    UPDATE public.user_tool_usage SET usage_count = COALESCE(_current_count, 0) + 1 WHERE id = _existing_usage_id;
  ELSE
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count) VALUES (_user_id, _tool_id, _today, 1);
  END IF;

  RETURN json_build_object(
    'success', true,
    'deducted', _credit_cost,
    'balance', _new_balance
  );
END;
$$;