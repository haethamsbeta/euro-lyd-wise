
-- Pin search_path on functions that didn't have it set explicitly
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth;
ALTER FUNCTION public.set_account_number() SET search_path = public;

-- Lock down EXECUTE on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_account_number() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.post_transaction(uuid, public.currency_code, public.tx_direction, public.vault_channel, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_transaction(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_transaction(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_transaction(uuid, public.currency_code, public.tx_direction, public.vault_channel, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_transaction(uuid, text) TO authenticated;
