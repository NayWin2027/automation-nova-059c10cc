ALTER TABLE public.site_announcements
  ADD COLUMN IF NOT EXISTS is_marquee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marquee_speed text NOT NULL DEFAULT 'normal';