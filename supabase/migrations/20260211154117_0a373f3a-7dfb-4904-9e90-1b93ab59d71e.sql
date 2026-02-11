
-- Add success_count and error_count columns to user_tool_usage
ALTER TABLE public.user_tool_usage 
ADD COLUMN IF NOT EXISTS success_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_count integer NOT NULL DEFAULT 0;

-- Create RPC to record tool outcome (success or error)
CREATE OR REPLACE FUNCTION public.record_tool_outcome(
  _user_id uuid,
  _tool_id text,
  _outcome text -- 'success' or 'error'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _today date := CURRENT_DATE;
BEGIN
  IF _outcome = 'success' THEN
    UPDATE public.user_tool_usage
    SET success_count = success_count + 1
    WHERE user_id = _user_id AND tool_id = _tool_id AND usage_date = _today;
  ELSIF _outcome = 'error' THEN
    UPDATE public.user_tool_usage
    SET error_count = error_count + 1
    WHERE user_id = _user_id AND tool_id = _tool_id AND usage_date = _today;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid outcome. Use success or error.');
  END IF;

  -- If no row was updated (usage not yet recorded today), insert one
  IF NOT FOUND THEN
    INSERT INTO public.user_tool_usage (user_id, tool_id, usage_date, usage_count, success_count, error_count)
    VALUES (
      _user_id, _tool_id, _today, 1,
      CASE WHEN _outcome = 'success' THEN 1 ELSE 0 END,
      CASE WHEN _outcome = 'error' THEN 1 ELSE 0 END
    )
    ON CONFLICT (user_id, tool_id, usage_date)
    DO UPDATE SET
      success_count = user_tool_usage.success_count + CASE WHEN _outcome = 'success' THEN 1 ELSE 0 END,
      error_count = user_tool_usage.error_count + CASE WHEN _outcome = 'error' THEN 1 ELSE 0 END;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;
