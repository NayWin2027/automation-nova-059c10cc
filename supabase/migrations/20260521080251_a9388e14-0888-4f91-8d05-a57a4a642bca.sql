INSERT INTO public.tool_settings (tool_id, title, description, is_enabled, requires_auth, is_premium, credit_cost, daily_free_limit)
VALUES ('edge-tts', 'Edge TTS - မြန်မာ', 'Microsoft Edge TTS — Thiha + Nilar Burmese voices', true, true, false, 5, 3)
ON CONFLICT (tool_id) DO NOTHING;