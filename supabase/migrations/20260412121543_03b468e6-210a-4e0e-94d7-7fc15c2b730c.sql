
-- Sequence for shared running numbers across all payment methods
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1 INCREMENT BY 1;

-- Function to generate order number with correct prefix
CREATE OR REPLACE FUNCTION public.generate_order_number(_payment_method text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seq_val integer;
  _prefix text;
BEGIN
  _seq_val := nextval('public.order_number_seq');
  
  IF _payment_method = 'thai_bank' THEN
    _prefix := 'kys';
  ELSE
    _prefix := 'nw';
  END IF;
  
  RETURN _prefix || lpad(_seq_val::text, 4, '0');
END;
$$;

-- Payment orders table
CREATE TABLE public.payment_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number text NOT NULL UNIQUE,
  order_type text NOT NULL CHECK (order_type IN ('new_user', 'topup', 'renew')),
  payment_method text NOT NULL CHECK (payment_method IN ('kpay', 'wave', 'thai_bank')),
  user_email text NOT NULL,
  user_id uuid DEFAULT NULL,
  slip_image_path text DEFAULT NULL,
  payment_ref text DEFAULT NULL,
  referrer_display_id text DEFAULT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_credit_amount integer DEFAULT NULL,
  admin_bonus_amount integer DEFAULT 0,
  admin_notes text DEFAULT NULL,
  approved_by uuid DEFAULT NULL,
  approved_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on payment_ref to prevent duplicate transaction numbers
CREATE UNIQUE INDEX idx_payment_orders_payment_ref ON public.payment_orders (payment_ref) WHERE payment_ref IS NOT NULL;

-- Index for admin queries
CREATE INDEX idx_payment_orders_status ON public.payment_orders (status);
CREATE INDEX idx_payment_orders_user_id ON public.payment_orders (user_id);

-- Enable RLS
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone (including anon) can INSERT orders (new users don't have accounts)
CREATE POLICY "Anyone can submit orders"
ON public.payment_orders
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- RLS: Admins can view all orders
CREATE POLICY "Admins can view all orders"
ON public.payment_orders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Authenticated users can view their own orders
CREATE POLICY "Users can view own orders"
ON public.payment_orders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- RLS: Admins can update orders (for approval/rejection)
CREATE POLICY "Admins can update orders"
ON public.payment_orders
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: Admins can delete orders
CREATE POLICY "Admins can delete orders"
ON public.payment_orders
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_payment_orders_updated_at
BEFORE UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for payment slips
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-slips', 'payment-slips', false)
ON CONFLICT (id) DO NOTHING;

-- Storage: Anyone can upload slips (new users are anon)
CREATE POLICY "Anyone can upload payment slips"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'payment-slips');

-- Storage: Admins can view all slips
CREATE POLICY "Admins can view payment slips"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'payment-slips' AND has_role(auth.uid(), 'admin'::app_role));

-- Storage: Admins can delete slips
CREATE POLICY "Admins can delete payment slips"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'payment-slips' AND has_role(auth.uid(), 'admin'::app_role));
