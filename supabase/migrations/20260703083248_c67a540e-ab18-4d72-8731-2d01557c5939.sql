
REVOKE EXECUTE ON FUNCTION public.get_or_create_referral_code(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.count_referred_friends(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_referral_reward(uuid) FROM PUBLIC, anon;
