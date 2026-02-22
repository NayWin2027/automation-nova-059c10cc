-- Insert master_admin role for the two master admin users
-- nerfspiderman2025@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('3d06c8f8-5406-4d4e-bb93-5bc92f2ff981', 'master_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- monthargree@gmail.com  
INSERT INTO public.user_roles (user_id, role)
VALUES ('9ced01c2-c191-4459-9fdc-8a746d3e407f', 'master_admin')
ON CONFLICT (user_id, role) DO NOTHING;