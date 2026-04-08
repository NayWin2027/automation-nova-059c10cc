
-- 1. Drop the old permissive UPDATE policy for profiles
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- 2. Create a restricted UPDATE policy that only allows safe columns
CREATE POLICY "Users can update safe profile fields only"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND plan = (SELECT p.plan FROM public.profiles p WHERE p.user_id = auth.uid())
  AND credits = (SELECT p.credits FROM public.profiles p WHERE p.user_id = auth.uid())
  AND credits_started_at IS NOT DISTINCT FROM (SELECT p.credits_started_at FROM public.profiles p WHERE p.user_id = auth.uid())
  AND is_banned = (SELECT p.is_banned FROM public.profiles p WHERE p.user_id = auth.uid())
  AND ban_reason IS NOT DISTINCT FROM (SELECT p.ban_reason FROM public.profiles p WHERE p.user_id = auth.uid())
  AND email = (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- 3. Harden has_role() to prevent NULL JWT bypass
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller_role text;
BEGIN
  -- Get the current database role
  _caller_role := current_setting('role', true);
  
  -- Service role (edge functions) can look up any user
  IF _caller_role = 'service_role' THEN
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
$function$;
