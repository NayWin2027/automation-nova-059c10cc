-- Fix has_role function to work with service role (edge functions)
-- Service role calls don't have auth.uid(), so we need to allow direct lookup when no auth context exists
-- This is secure because the service role key should only be used server-side

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_service_role boolean;
BEGIN
  -- Check if this is a service role call (no auth context but accessing directly)
  -- Service role bypasses RLS and is used by edge functions
  _is_service_role := current_setting('role', true) = 'service_role' 
                      OR current_setting('request.jwt.claims', true) IS NULL;
  
  -- If service role (edge function), allow the lookup
  IF _is_service_role THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    );
  END IF;

  -- For regular authenticated users
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  
  -- If checking own role, allow
  IF _user_id = auth.uid() THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    );
  END IF;
  
  -- If caller is admin, allow checking any user's role
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  ) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    );
  END IF;
  
  -- Otherwise deny
  RETURN false;
END;
$function$;