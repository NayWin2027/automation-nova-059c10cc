
-- 1. Add admin SELECT/DELETE policies on recap-videos bucket
CREATE POLICY "Admins can view all recap videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'recap-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete any recap video"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'recap-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Restrict app_settings: remove sensitive keys from public view
DROP POLICY IF EXISTS "Anyone can view safe app settings" ON public.app_settings;

CREATE POLICY "Anyone can view safe app settings"
ON public.app_settings FOR SELECT TO public
USING (key = ANY (ARRAY[
  'app_name'::text, 'app_subtitle'::text, 'logo_url'::text, 
  'favicon_url'::text, 'primary_color'::text, 'accent_color'::text, 
  'contact_email'::text, 'contact_phone'::text, 'discord_url'::text, 
  'footer_text'::text
]));
