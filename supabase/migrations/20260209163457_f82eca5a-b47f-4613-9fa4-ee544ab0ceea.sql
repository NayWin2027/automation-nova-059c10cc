
-- Allow anyone to read transcribe_settings from app_settings
DROP POLICY IF EXISTS "Anyone can view safe app settings" ON public.app_settings;
CREATE POLICY "Anyone can view safe app settings"
ON public.app_settings
FOR SELECT
USING (key = ANY (ARRAY['app_name','app_subtitle','logo_url','favicon_url','primary_color','accent_color','contact_email','contact_phone','discord_url','footer_text','plan_settings','transcribe_settings']));
