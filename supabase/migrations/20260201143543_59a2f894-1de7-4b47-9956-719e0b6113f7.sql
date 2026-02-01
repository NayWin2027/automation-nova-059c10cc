-- Fix PUBLIC_DATA_EXPOSURE: Restrict app_settings and tool_settings to authenticated users only

-- Drop existing public policies
DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Anyone can read tool settings" ON public.tool_settings;

-- Create new restricted policies for authenticated users only
CREATE POLICY "Authenticated users can view app settings" 
ON public.app_settings 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can view tool settings" 
ON public.tool_settings 
FOR SELECT 
TO authenticated 
USING (true);

-- Create RPC function for server-side credit deduction (atomic operation)
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
BEGIN
  -- Skip deduction if using own API key
  IF _is_own_api THEN
    RETURN json_build_object('success', true, 'skipped', true, 'reason', 'using_own_api');
  END IF;

  -- Get tool credit cost
  SELECT COALESCE(credit_cost, 10) INTO _credit_cost
  FROM public.tool_settings
  WHERE tool_id = _tool_id;

  IF _credit_cost IS NULL THEN
    _credit_cost := 10; -- Default cost
  END IF;

  -- Get user's current credits and plan
  SELECT credits, plan INTO _current_credits, _user_plan
  FROM public.profiles
  WHERE user_id = _user_id
  FOR UPDATE; -- Lock row for atomic update

  IF _current_credits IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User profile not found');
  END IF;

  -- Premium users don't lose credits
  IF _user_plan = 'premium' THEN
    RETURN json_build_object('success', true, 'skipped', true, 'reason', 'premium_user', 'balance', _current_credits);
  END IF;

  -- Check if user has enough credits
  IF _current_credits < _credit_cost THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient credits',
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

  RETURN json_build_object(
    'success', true,
    'deducted', _credit_cost,
    'balance', _new_balance
  );
END;
$$;