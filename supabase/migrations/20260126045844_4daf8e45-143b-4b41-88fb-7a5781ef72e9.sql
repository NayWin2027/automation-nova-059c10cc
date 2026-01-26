-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Re-insert the admin secret with proper hashing now that pgcrypto is available
DELETE FROM public.admin_secrets;
INSERT INTO public.admin_secrets (secret_hash) 
VALUES (crypt('ADMIN2024SECRET', gen_salt('bf')));