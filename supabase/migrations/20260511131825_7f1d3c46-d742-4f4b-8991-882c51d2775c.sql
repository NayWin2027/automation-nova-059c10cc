ALTER TABLE public.tool_settings
ADD COLUMN IF NOT EXISTS server_credit_per_min integer NOT NULL DEFAULT 5;