CREATE POLICY "Admins can upload showcase videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'showcase-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update showcase videos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'showcase-videos' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'showcase-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete showcase videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'showcase-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read showcase videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'showcase-videos');

CREATE POLICY "Anon can read showcase videos"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'showcase-videos');