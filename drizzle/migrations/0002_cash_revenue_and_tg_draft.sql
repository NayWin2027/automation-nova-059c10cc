ALTER TABLE public.credit_topups ADD COLUMN IF NOT EXISTS cash_amount numeric;
COMMENT ON COLUMN public.credit_topups.cash_amount IS 'Real MMK received. When set (>0) revenue uses this instead of amount*100.';
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS tg_draft jsonb;
COMMENT ON COLUMN public.payment_orders.tg_draft IS 'Telegram admin approval wizard state.';