-- Create storage bucket for temporary transcription file uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-uploads',
  'temp-uploads',
  false,
  157286400, -- 150MB limit
  ARRAY['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/x-m4a', 'video/mp4', 'video/webm', 'video/x-matroska', 'video/x-msvideo', 'video/quicktime', 'video/3gpp']
);

-- Authenticated users can upload their own files
CREATE POLICY "Users can upload temp files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'temp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can read their own files
CREATE POLICY "Users can read own temp files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'temp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own files
CREATE POLICY "Users can delete own temp files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'temp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Service role can access all (for edge function)
CREATE POLICY "Service role full access temp uploads"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'temp-uploads');