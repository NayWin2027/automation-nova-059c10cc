CREATE OR REPLACE FUNCTION public.tutorials_are_public()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT requires_auth = false FROM public.tool_settings WHERE tool_id = 'tutorials' LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.tutorials_are_public() TO anon, authenticated;
GRANT SELECT ON public.tutorials TO anon;

CREATE POLICY "Public can view published tutorials when public mode"
ON public.tutorials
FOR SELECT
TO anon, authenticated
USING (is_published = true AND public.tutorials_are_public());

CREATE POLICY "Public can view tutorial videos when public mode"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'tutorial-videos' AND public.tutorials_are_public());