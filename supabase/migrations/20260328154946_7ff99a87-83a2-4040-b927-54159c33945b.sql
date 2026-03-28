
CREATE TABLE public.user_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  password_plain text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_passwords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view passwords"
  ON public.user_passwords FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role insert only"
  ON public.user_passwords FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Service role update only"
  ON public.user_passwords FOR UPDATE
  USING (false);
