-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create enum for subscription plans
CREATE TYPE public.subscription_plan AS ENUM ('free', 'pro', 'premium');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    email TEXT NOT NULL,
    display_name TEXT,
    credits INTEGER NOT NULL DEFAULT 100,
    plan subscription_plan NOT NULL DEFAULT 'free',
    is_banned BOOLEAN NOT NULL DEFAULT false,
    ban_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_devices table for multi-device tracking
CREATE TABLE public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_fingerprint TEXT NOT NULL,
    device_info JSONB,
    last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, device_fingerprint)
);

-- Create activity_logs table
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    tool_name TEXT NOT NULL,
    action TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create app_settings table for CMS/branding
CREATE TABLE public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Create admin_secret table (stores hashed secret code)
CREATE TABLE public.admin_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default admin secret (hash of 'ADMIN2024SECRET')
INSERT INTO public.admin_secrets (secret_hash) VALUES (
    crypt('ADMIN2024SECRET', gen_salt('bf'))
);

-- Insert default app settings
INSERT INTO public.app_settings (key, value) VALUES
('branding', '{"appName": "MyanmarAI Tools", "title": "AI-Powered Tools", "subtitle": "Professional Myanmar Language Processing", "primaryColor": "220 70% 50%", "backgroundColor": "222 84% 5%", "textColor": "210 40% 98%"}'),
('features', '{"maxDevices": 2, "defaultCredits": 100}');

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_secrets ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check admin role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role = _role
    )
$$;

-- Create function to verify admin secret
CREATE OR REPLACE FUNCTION public.verify_admin_secret(secret_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_secrets
        WHERE secret_hash = crypt(secret_input, secret_hash)
    );
END;
$$;

-- Create function to count user devices
CREATE OR REPLACE FUNCTION public.count_user_devices(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER FROM public.user_devices WHERE user_id = _user_id
$$;

-- Create function to auto-ban user if too many devices
CREATE OR REPLACE FUNCTION public.check_and_ban_excess_devices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    device_count INTEGER;
    max_devices INTEGER;
BEGIN
    SELECT COUNT(*) INTO device_count FROM public.user_devices WHERE user_id = NEW.user_id;
    SELECT (value->>'maxDevices')::INTEGER INTO max_devices FROM public.app_settings WHERE key = 'features';
    
    IF device_count > COALESCE(max_devices, 2) THEN
        UPDATE public.profiles 
        SET is_banned = true, ban_reason = 'Auto-banned: Exceeded maximum device limit'
        WHERE user_id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for auto-ban on excess devices
CREATE TRIGGER trigger_check_devices
AFTER INSERT ON public.user_devices
FOR EACH ROW
EXECUTE FUNCTION public.check_and_ban_excess_devices();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_devices
CREATE POLICY "Users can view their own devices"
ON public.user_devices FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all devices"
ON public.user_devices FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own devices"
ON public.user_devices FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all devices"
ON public.user_devices FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for activity_logs
CREATE POLICY "Users can view their own logs"
ON public.activity_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all logs"
ON public.activity_logs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own logs"
ON public.activity_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all logs"
ON public.activity_logs FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for app_settings
CREATE POLICY "Anyone can view app settings"
ON public.app_settings FOR SELECT
USING (true);

CREATE POLICY "Admins can manage app settings"
ON public.app_settings FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for admin_secrets (no one can read directly)
CREATE POLICY "No direct access to admin secrets"
ON public.admin_secrets FOR SELECT
USING (false);

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email)
    VALUES (NEW.id, NEW.email);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$$;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();