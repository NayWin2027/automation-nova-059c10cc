
CREATE TRIGGER on_credits_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.credits IS DISTINCT FROM OLD.credits)
  EXECUTE FUNCTION public.handle_credits_started_at();
