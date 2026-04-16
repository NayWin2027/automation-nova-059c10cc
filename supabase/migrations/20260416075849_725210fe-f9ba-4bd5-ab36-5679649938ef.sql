
ALTER TABLE public.credit_topups DROP CONSTRAINT IF EXISTS credit_topups_topup_type_check;
ALTER TABLE public.credit_topups ADD CONSTRAINT credit_topups_topup_type_check CHECK (topup_type = ANY (ARRAY['original'::text, 'topup'::text, 'bonus'::text, 'renew'::text, 'referral'::text]));
