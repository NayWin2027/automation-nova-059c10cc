
-- Add credits_started_at column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS credits_started_at timestamp with time zone DEFAULT NULL;

-- Create trigger to auto-set credits_started_at when credits are topped up
CREATE OR REPLACE FUNCTION public.handle_credits_started_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when credits increase
  IF NEW.credits > OLD.credits THEN
    IF OLD.credits_started_at IS NULL THEN
      -- First time getting credits
      NEW.credits_started_at := now();
    ELSIF OLD.credits_started_at + INTERVAL '1 month' < now() 
      AND OLD.credits_started_at + INTERVAL '1 month' + INTERVAL '7 days' >= now() THEN
      -- Within grace period: reset start date (merge scenario)
      NEW.credits_started_at := now();
    ELSIF OLD.credits_started_at + INTERVAL '1 month' + INTERVAL '7 days' < now() THEN
      -- Past grace period: fresh start
      NEW.credits_started_at := now();
    END IF;
    -- If still within 1 month, keep existing credits_started_at
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_credits_started_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_credits_started_at();

-- Update deduct_user_credits to check expiration
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
BEGIN
  -- Check if user is admin - admins are exempt from credit deduction
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = 'admin'::app_role
  ) INTO _is_admin;

  IF _is_admin THEN
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count)
    VALUES (_user_id, _tool_id, _today, 1)
    ON CONFLICT (user_id, tool_id, usage_date)
    DO UPDATE SET usage_count = user_tool_usage.usage_count + 1;

    SELECT credits INTO _current_credits FROM public.profiles WHERE user_id = _user_id;

    RETURN json_build_object(
      'success', true,
      'balance', COALESCE(_current_credits, 0),
      'deducted', 0,
      'is_admin', true
    );
  END IF;

  -- Get user profile
  SELECT plan, credits, credits_started_at INTO _user_plan, _current_credits, _credits_started_at
  FROM public.profiles
  WHERE user_id = _user_id;

  IF _user_plan IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User profile not found',
      'errorCode', 'USER_NOT_FOUND'
    );
  END IF;

  -- Check credit expiration (1 month + 7 day grace period)
  IF _credits_started_at IS NOT NULL 
     AND _credits_started_at + INTERVAL '1 month' + INTERVAL '7 days' < now() THEN
    -- Credits have expired - zero them out
    UPDATE public.profiles
    SET credits = 0, credits_started_at = NULL, updated_at = now()
    WHERE user_id = _user_id;

    RETURN json_build_object(
      'success', false,
      'error', 'Credit သက်တမ်းကုန်ဆုံးသွားပါပြီ။ Credit ထပ်ဖြည့်ပါ။',
      'errorCode', 'CREDITS_EXPIRED',
      'balance', 0
    );
  END IF;

  -- Determine credit cost: use _custom_cost if provided, else read from tool_settings
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

  -- If using own API key, skip credit deduction but log usage
  IF _is_own_api THEN
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

  -- If custom cost is 0, skip deduction (free tool usage)
  IF _credit_cost = 0 THEN
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count)
    VALUES (_user_id, _tool_id, _today, 1)
    ON CONFLICT (user_id, tool_id, usage_date)
    DO UPDATE SET usage_count = user_tool_usage.usage_count + 1;

    RETURN json_build_object(
      'success', true,
      'balance', _current_credits,
      'deducted', 0
    );
  END IF;

  -- ALL non-admin, non-own-api users get credits deducted (including premium)
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

  -- Log usage
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
$function$;
