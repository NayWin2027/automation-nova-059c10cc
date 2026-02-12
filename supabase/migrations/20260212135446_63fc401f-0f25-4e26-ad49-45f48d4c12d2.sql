
-- Add active session tracking to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_session_id TEXT DEFAULT NULL;

-- RPC: Register active session (called on login)
CREATE OR REPLACE FUNCTION public.register_active_session(_user_id uuid, _session_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET active_session_id = _session_id
  WHERE user_id = _user_id;
END;
$$;

-- RPC: Check if current session is still active
CREATE OR REPLACE FUNCTION public.check_active_session(_user_id uuid, _session_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _stored_session text;
BEGIN
  SELECT active_session_id INTO _stored_session
  FROM public.profiles
  WHERE user_id = _user_id;
  
  -- If no stored session, allow (first login)
  IF _stored_session IS NULL THEN
    RETURN true;
  END IF;
  
  RETURN _stored_session = _session_id;
END;
$$;
