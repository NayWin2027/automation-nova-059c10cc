
ALTER TABLE public.credit_topups 
ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
ADD COLUMN deleted_by uuid REFERENCES auth.users(id) DEFAULT NULL,
ADD COLUMN deleted_at timestamptz DEFAULT NULL;
