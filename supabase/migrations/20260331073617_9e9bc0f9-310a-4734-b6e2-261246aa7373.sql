
CREATE TABLE public.credit_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  topup_type text NOT NULL DEFAULT 'topup' CHECK (topup_type IN ('original', 'topup', 'bonus')),
  note text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.credit_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all topups"
  ON public.credit_topups FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role insert only"
  ON public.credit_topups FOR INSERT
  WITH CHECK (false);

CREATE INDEX idx_credit_topups_user_id ON public.credit_topups(user_id);
