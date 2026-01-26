-- Recreate verify_admin_secret with explicit extensions schema
CREATE OR REPLACE FUNCTION public.verify_admin_secret(secret_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_secrets 
    WHERE secret_hash = extensions.crypt(secret_input, secret_hash)
  );
END;
$$;