
-- 1. Drop user_passwords table entirely (data already purged, deny-all RLS in place)
DROP POLICY IF EXISTS "deny_all_select_passwords" ON public.user_passwords;
DROP POLICY IF EXISTS "Service role insert only" ON public.user_passwords;
DROP POLICY IF EXISTS "Service role update only" ON public.user_passwords;
DROP TABLE IF EXISTS public.user_passwords;

-- 2. Add explicit UPDATE policy on recap-videos storage bucket
CREATE POLICY "Users can update their own recap videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'recap-videos' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'recap-videos' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 3. Make tutorial-videos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'tutorial-videos';

-- 4. Add storage policies for tutorial-videos (private bucket)
-- Admins can do everything
CREATE POLICY "Admins can manage tutorial videos"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'tutorial-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'tutorial-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Premium users can view (for signed URL access)
CREATE POLICY "Premium users can view tutorial videos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'tutorial-videos' 
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.plan = 'premium'::public.subscription_plan
  )
);
