-- Create tool_settings table for admin to manage each tool
CREATE TABLE public.tool_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  requires_auth BOOLEAN DEFAULT true,
  is_premium BOOLEAN DEFAULT false,
  daily_free_limit INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_tool_usage table to track daily usage
CREATE TABLE public.user_tool_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tool_id TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, tool_id, usage_date)
);

-- Enable RLS
ALTER TABLE public.tool_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tool_usage ENABLE ROW LEVEL SECURITY;

-- Tool settings policies (public read, admin write)
CREATE POLICY "Anyone can read tool settings"
  ON public.tool_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage tool settings"
  ON public.tool_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- User tool usage policies
CREATE POLICY "Users can view own usage"
  ON public.user_tool_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON public.user_tool_usage FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON public.user_tool_usage FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Insert default tool settings
INSERT INTO public.tool_settings (tool_id, title, description, is_enabled, requires_auth, is_premium, daily_free_limit) VALUES
  ('recap', 'Video Recap', 'ဗီဒီယို Recap နှင့် အကျဉ်းချုပ်ထုတ်ယူခြင်း။', true, true, true, 0),
  ('transcribe', 'Transcribe', 'အသံဖိုင်မှ စာသားပြောင်းလဲခြင်း။', true, true, false, 3),
  ('story', 'Story Creator', 'စာအုပ်လမ်းညွှန်များ ရေးသားခြင်း။', true, true, false, 3),
  ('thumbnail', 'Thumbnail', 'AI Thumbnail ပုံရိုက်ခြင်း။', true, true, false, 3),
  ('translate', 'Translate', 'ဘာသာစကားများ ပြောင်းလဲခြင်း။', true, true, false, 3),
  ('srt', 'SRT Sub', 'SRT ဖိုင်များ ဘာသာပြန်ခြင်း။', true, true, false, 3),
  ('novel', 'Novel Trans', 'ဝတ္ထုများ ဘာသာပြန်ခြင်း။', true, true, false, 3),
  ('voice', 'AI Voice', 'စာသားမှ အသံထုတ်ခြင်း။', true, true, false, 3),
  ('subgen', 'Sub Gen', 'စာတန်းထိုး ဖန်တီးခြင်း။', true, true, false, 3),
  ('creator', 'Creator', 'မီဒီယာစီမံမှု ဖန်တီးခြင်း။', true, true, false, 3),
  ('downloader', 'Downloader', 'TikTok မီဒီယာများ ဒေါင်းလုဒ်ဆွဲခြင်း။', true, true, false, 3);

-- Add global access settings to app_settings
INSERT INTO public.app_settings (key, value) VALUES
  ('access_control', '{"requireLogin": true, "freeMode": false, "promotionMode": false, "promotionDailyLimit": 3, "promotionToolCount": 3}')
ON CONFLICT (key) DO NOTHING;

-- Trigger for updated_at
CREATE TRIGGER update_tool_settings_updated_at
  BEFORE UPDATE ON public.tool_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();