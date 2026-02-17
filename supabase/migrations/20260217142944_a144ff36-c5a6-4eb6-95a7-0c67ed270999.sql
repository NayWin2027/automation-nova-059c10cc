
-- Create recap_history table
CREATE TABLE public.recap_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Recap',
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  duration_seconds NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Enable RLS
ALTER TABLE public.recap_history ENABLE ROW LEVEL SECURITY;

-- Users can view their own recaps
CREATE POLICY "Users can view their own recaps"
ON public.recap_history FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own recaps
CREATE POLICY "Users can insert their own recaps"
ON public.recap_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own recaps
CREATE POLICY "Users can delete their own recaps"
ON public.recap_history FOR DELETE
USING (auth.uid() = user_id);

-- Admins can manage all recaps
CREATE POLICY "Admins can manage all recaps"
ON public.recap_history FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for recap videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('recap-videos', 'recap-videos', false);

-- Storage policies: users can manage their own folder
CREATE POLICY "Users can upload recap videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'recap-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own recap videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'recap-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own recap videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'recap-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Auto-cleanup function for expired recaps
CREATE OR REPLACE FUNCTION public.cleanup_expired_recaps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _rec RECORD;
BEGIN
  FOR _rec IN
    SELECT id, storage_path FROM public.recap_history
    WHERE expires_at < now()
  LOOP
    -- Delete from storage
    DELETE FROM storage.objects
    WHERE bucket_id = 'recap-videos' AND name = _rec.storage_path;
    
    -- Delete from history
    DELETE FROM public.recap_history WHERE id = _rec.id;
  END LOOP;
END;
$function$;
