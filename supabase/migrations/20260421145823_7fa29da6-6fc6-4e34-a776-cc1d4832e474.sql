DROP POLICY IF EXISTS "Anyone can view safe app settings" ON public.app_settings;

CREATE POLICY "Anyone can view safe app settings"
ON public.app_settings FOR SELECT TO public
USING (key = ANY (ARRAY[
  'app_name'::text,
  'app_subtitle'::text,
  'logo_url'::text,
  'favicon_url'::text,
  'primary_color'::text,
  'accent_color'::text,
  'contact_email'::text,
  'contact_phone'::text,
  'discord_url'::text,
  'footer_text'::text,
  'voice_settings'::text
]));