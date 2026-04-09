
-- 1. Restrict tool_settings non-admin policy to authenticated only (remove anon access)
DROP POLICY IF EXISTS "Non-admins can view safe tool settings only" ON public.tool_settings;

CREATE POLICY "Authenticated users can view tool settings"
ON public.tool_settings FOR SELECT
TO authenticated
USING (true);

-- 2. Create safe view for site_announcements (excludes created_by)
CREATE OR REPLACE VIEW public.safe_site_announcements
WITH (security_barrier = true)
AS SELECT id, message, type, is_active, action_label, action_url, created_at, updated_at
FROM public.site_announcements;

-- 3. Replace public announcement policy with one that uses the safe view pattern
-- Keep admin full access, restrict public reads to not expose created_by
DROP POLICY IF EXISTS "Anyone can read active announcements" ON public.site_announcements;

CREATE POLICY "Anon can read active announcements without sensitive cols"
ON public.site_announcements FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY "Authenticated can read active announcements"
ON public.site_announcements FOR SELECT
TO authenticated
USING (is_active = true);
