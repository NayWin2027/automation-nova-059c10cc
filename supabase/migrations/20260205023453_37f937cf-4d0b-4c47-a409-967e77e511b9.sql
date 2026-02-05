-- Create table to store TOTP secrets for admin 2FA
CREATE TABLE public.admin_totp_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  totp_secret text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_totp_secrets ENABLE ROW LEVEL SECURITY;

-- Only admins can access their own TOTP secrets
CREATE POLICY "Admins can view their own TOTP secret"
ON public.admin_totp_secrets
FOR SELECT
USING (
  auth.uid() = user_id 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can insert their own TOTP secret"
ON public.admin_totp_secrets
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update their own TOTP secret"
ON public.admin_totp_secrets
FOR UPDATE
USING (
  auth.uid() = user_id 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete their own TOTP secret"
ON public.admin_totp_secrets
FOR DELETE
USING (
  auth.uid() = user_id 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Add trigger for updated_at
CREATE TRIGGER update_admin_totp_secrets_updated_at
  BEFORE UPDATE ON public.admin_totp_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to check if admin has 2FA enabled (for login flow)
CREATE OR REPLACE FUNCTION public.check_admin_2fa_status(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _has_2fa boolean;
  _2fa_enabled boolean;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = 'admin'::app_role
  ) INTO _is_admin;
  
  IF NOT _is_admin THEN
    RETURN json_build_object(
      'is_admin', false,
      'has_2fa', false,
      'enabled', false
    );
  END IF;
  
  -- Check if admin has TOTP configured and enabled
  SELECT 
    EXISTS (SELECT 1 FROM public.admin_totp_secrets WHERE user_id = _user_id),
    COALESCE((SELECT is_enabled FROM public.admin_totp_secrets WHERE user_id = _user_id), false)
  INTO _has_2fa, _2fa_enabled;
  
  RETURN json_build_object(
    'is_admin', true,
    'has_2fa', _has_2fa,
    'enabled', _2fa_enabled
  );
END;
$$;