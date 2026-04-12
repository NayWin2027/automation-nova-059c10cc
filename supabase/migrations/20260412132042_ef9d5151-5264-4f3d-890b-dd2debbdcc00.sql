-- Add contact info column to payment_orders for storing user contact method
ALTER TABLE public.payment_orders 
ADD COLUMN contact_method TEXT,
ADD COLUMN contact_value TEXT;