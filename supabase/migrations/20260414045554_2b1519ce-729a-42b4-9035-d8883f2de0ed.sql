
CREATE OR REPLACE FUNCTION public.generate_order_number(_payment_method text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _max_num integer := 0;
  _current_num integer;
  _prefix text;
  _email_prefix text;
BEGIN
  -- Find the highest numeric suffix from all user emails in profiles table
  -- Emails like nw0062@internal.user, kys0055@internal.user, 12345@internal.user
  FOR _email_prefix IN
    SELECT split_part(email, '@', 1) FROM public.profiles
  LOOP
    -- Extract trailing digits from the prefix
    _current_num := NULL;
    BEGIN
      -- Remove leading letters (nw, kys, or none) and parse the number
      IF _email_prefix ~ '^[a-zA-Z]+[0-9]+$' THEN
        -- Has letter prefix like nw0062 or kys0055
        _current_num := regexp_replace(_email_prefix, '^[a-zA-Z]+', '')::integer;
      ELSIF _email_prefix ~ '^[0-9]+$' THEN
        -- Pure numeric like 12345
        _current_num := _email_prefix::integer;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _current_num := NULL;
    END;

    IF _current_num IS NOT NULL AND _current_num > _max_num THEN
      _max_num := _current_num;
    END IF;
  END LOOP;

  -- Also check payment_orders for any pending orders not yet converted to users
  FOR _email_prefix IN
    SELECT order_number FROM public.payment_orders WHERE status = 'pending'
  LOOP
    BEGIN
      _current_num := regexp_replace(_email_prefix, '^[a-zA-Z]+', '')::integer;
    EXCEPTION WHEN OTHERS THEN
      _current_num := NULL;
    END;
    IF _current_num IS NOT NULL AND _current_num > _max_num THEN
      _max_num := _current_num;
    END IF;
  END LOOP;

  -- Next number
  _max_num := _max_num + 1;

  -- Determine prefix based on payment method
  IF _payment_method = 'thai_bank' THEN
    _prefix := 'kys';
  ELSE
    _prefix := 'nw';
  END IF;

  RETURN _prefix || lpad(_max_num::text, 4, '0');
END;
$function$;
