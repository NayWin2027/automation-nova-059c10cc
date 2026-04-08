
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $$
DECLARE
  _is_service_role boolean;
BEGIN
  -- Use pg_has_role to reliably detect service_role (cannot be spoofed by set_config)
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND pg_has_role(current_user, oid, 'member')
  ) INTO _is_service_role;

  -- Service role (edge functions) can look up any user
  IF _is_service_role THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  END IF;

  -- For all other callers, require a valid auth context
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  
  -- Users can check their own role
  IF _user_id = auth.uid() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  END IF;
  
  -- Admins can check any user's role
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  ) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  END IF;
  
  RETURN false;
END;
$$;
