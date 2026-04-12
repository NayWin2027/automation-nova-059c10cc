-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can upload payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete payment slips" ON storage.objects;

-- Allow anyone to upload payment slips
CREATE POLICY "Anyone can upload payment slips"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'payment-slips');

-- Only admins can view payment slips
CREATE POLICY "Admins can view payment slips"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'payment-slips' AND EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
));

-- Only admins can delete payment slips
CREATE POLICY "Admins can delete payment slips"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'payment-slips' AND EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
));