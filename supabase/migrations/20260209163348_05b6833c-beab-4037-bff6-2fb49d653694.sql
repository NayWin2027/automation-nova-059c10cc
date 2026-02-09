
-- Drop the old 3-parameter overload that causes PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.deduct_user_credits(uuid, text, boolean);
