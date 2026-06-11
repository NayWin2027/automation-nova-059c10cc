-- Add view_count to tutorials and RPC to increment it
ALTER TABLE public.tutorials
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_tutorial_view(_tutorial_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_count integer;
BEGIN
  UPDATE public.tutorials
  SET view_count = view_count + 1
  WHERE id = _tutorial_id AND is_published = true
  RETURNING view_count INTO _new_count;
  RETURN COALESCE(_new_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_tutorial_view(uuid) TO authenticated;