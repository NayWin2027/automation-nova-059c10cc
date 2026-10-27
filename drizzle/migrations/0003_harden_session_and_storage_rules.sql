-- 1) Only the signed-in owner can register their own active session
CREATE OR REPLACE FUNCTION public.register_active_session(_user_id uuid, _session_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.profiles
  SET active_session_id = left(_session_id, 200)
  WHERE user_id = _user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_active_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_active_session(uuid, text) TO authenticated, service_role;

-- 2) Payment slip uploads: signed-in users only into their own folder; guests only into public/
DROP POLICY IF EXISTS "Scoped payment slip uploads" ON storage.objects;

CREATE POLICY "Users upload payment slips to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-slips'
  AND (storage.foldername(name))[1] = (select auth.uid()::text)
);

CREATE POLICY "Guests upload payment slips to public folder"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'payment-slips'
  AND (storage.foldername(name))[1] = 'public'
);

-- 3) Showcase videos: non-admins can only read files of published showcase items while the page is enabled
CREATE OR REPLACE FUNCTION public.showcase_file_is_viewable(_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((SELECT is_enabled IS DISTINCT FROM false FROM public.tool_settings WHERE tool_id = 'showcase' LIMIT 1), true)
    AND EXISTS (
      SELECT 1 FROM public.showcase_items si
      WHERE si.is_published = true
        AND (si.source_path = _name OR si.output_path = _name)
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.showcase_file_is_viewable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.showcase_file_is_viewable(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated can read showcase videos" ON storage.objects;

CREATE POLICY "Users can read published showcase videos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'showcase-videos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.showcase_file_is_viewable(name)
  )
);