
DROP POLICY IF EXISTS "Deny all updates on temp-uploads" ON storage.objects;

CREATE POLICY "Deny all updates on temp-uploads"
ON storage.objects AS RESTRICTIVE
FOR UPDATE TO public
USING (bucket_id != 'temp-uploads');
