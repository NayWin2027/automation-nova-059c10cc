-- Allow admins to view all user_tool_usage records
CREATE POLICY "Admins can view all usage"
ON public.user_tool_usage
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));