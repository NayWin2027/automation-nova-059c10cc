
-- Add referred_by column to profiles (optional, one referrer per user)
ALTER TABLE public.profiles
ADD COLUMN referred_by uuid DEFAULT NULL;

-- Insert default referral reward setting
INSERT INTO public.app_settings (key, value)
VALUES ('referral_reward', '{"credits": 50}'::jsonb)
ON CONFLICT DO NOTHING;
