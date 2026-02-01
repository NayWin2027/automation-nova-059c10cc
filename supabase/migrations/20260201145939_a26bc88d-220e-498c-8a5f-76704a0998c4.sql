-- Fix SECURITY DEFINER functions to prevent information disclosure
-- 1. Update has_role() to only allow checking own roles (unless admin)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow checking own role OR if caller is an admin
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
$$;

-- 2. Update count_user_devices() to only allow counting own devices
CREATE OR REPLACE FUNCTION public.count_user_devices(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow counting own devices
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  
  IF _user_id != auth.uid() THEN
    -- Check if caller is admin
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    ) THEN
      RETURN 0;  -- Return 0 instead of actual count for non-admin users
    END IF;
  END IF;
  
  RETURN (
    SELECT COUNT(*)::integer
    FROM public.user_devices
    WHERE user_id = _user_id
  );
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.has_role IS 'Check if a user has a specific role. Users can only check their own role unless they are an admin.';
COMMENT ON FUNCTION public.count_user_devices IS 'Count devices for a user. Users can only count their own devices unless they are an admin.';