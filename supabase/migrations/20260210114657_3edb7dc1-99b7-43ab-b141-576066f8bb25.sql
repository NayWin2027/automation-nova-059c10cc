
-- Table to track promotion usage by IP + device fingerprint (for any user including guests)
CREATE TABLE public.promotion_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  device_model TEXT,
  tool_id TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  usage_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ip_address, device_fingerprint, tool_id, usage_date)
);

ALTER TABLE public.promotion_usage_tracking ENABLE ROW LEVEL SECURITY;

-- Public RLS: promotion tracking is for any user including guests
CREATE POLICY "anyone_can_select_promotion_tracking"
ON public.promotion_usage_tracking FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "anyone_can_insert_promotion_tracking"
ON public.promotion_usage_tracking FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "anyone_can_update_promotion_tracking"
ON public.promotion_usage_tracking FOR UPDATE TO anon, authenticated
USING (true);
