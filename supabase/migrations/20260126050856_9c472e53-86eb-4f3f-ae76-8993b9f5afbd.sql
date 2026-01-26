-- Ensure pgcrypto is enabled in the extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Drop and recreate the verify_admin_secret function with proper schema reference
DROP FUNCTION IF EXISTS public.verify_admin_secret(text);

CREATE OR REPLACE FUNCTION public.verify_admin_secret(secret_input text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_secrets 
    WHERE secret_hash = extensions.crypt(secret_input, secret_hash)
  );
END;
$$;

-- Re-insert the admin secret with proper schema reference
DELETE FROM public.admin_secrets;
INSERT INTO public.admin_secrets (secret_hash) 
VALUES (extensions.crypt('ADMIN2024SECRET', extensions.gen_salt('bf')));