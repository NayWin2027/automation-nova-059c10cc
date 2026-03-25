
-- Tutorials table
CREATE TABLE public.tutorials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  video_url text,
  storage_path text,
  category text NOT NULL DEFAULT 'general',
  order_index integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tutorials ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage tutorials"
  ON public.tutorials FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Published tutorials visible to premium users
CREATE POLICY "Premium users can view published tutorials"
  ON public.tutorials FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.plan = 'premium'
    )
  );

-- Storage bucket for tutorial videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('tutorial-videos', 'tutorial-videos', true);

-- Storage policies
CREATE POLICY "Admins can upload tutorial videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tutorial-videos'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete tutorial videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tutorial-videos'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Anyone can view tutorial videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'tutorial-videos');

-- Trigger for updated_at
CREATE TRIGGER update_tutorials_updated_at
  BEFORE UPDATE ON public.tutorials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
