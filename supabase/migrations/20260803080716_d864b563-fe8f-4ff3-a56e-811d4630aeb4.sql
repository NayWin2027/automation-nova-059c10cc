CREATE TABLE public.recap_series (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_name text NOT NULL,
  last_part integer NOT NULL DEFAULT 0,
  story_bible jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, series_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recap_series TO authenticated;
GRANT ALL ON public.recap_series TO service_role;

ALTER TABLE public.recap_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own recap series"
ON public.recap_series
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_recap_series_updated_at
BEFORE UPDATE ON public.recap_series
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();