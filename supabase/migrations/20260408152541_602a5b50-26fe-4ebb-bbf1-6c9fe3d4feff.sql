
-- 1. Purge all existing plaintext passwords
TRUNCATE TABLE public.user_passwords;

-- 2. Drop the admin SELECT policy (was exposing plaintext passwords)
DROP POLICY IF EXISTS "Admins can view passwords" ON public.user_passwords;

-- 3. Replace with deny-all SELECT policy
CREATE POLICY "deny_all_select_passwords"
ON public.user_passwords
FOR SELECT
USING (false);
