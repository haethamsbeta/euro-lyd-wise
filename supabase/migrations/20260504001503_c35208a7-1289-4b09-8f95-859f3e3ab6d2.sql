CREATE OR REPLACE FUNCTION public.ensure_customer_account_for_holder_account(p_holder_account_id bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ha public.holder_accounts;
  v_holder public.account_holders;
  v_acc_id uuid;
  v_nature public.account_nature;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'teller') OR public.has_role(v_uid,'admin')) THEN
    RAISE EXCEPTION 'Only tellers or admins can post transactions';
  END IF;

  SELECT * INTO v_ha FROM public.holder_accounts WHERE id = p_holder_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Holder account not found'; END IF;

  SELECT * INTO v_holder FROM public.account_holders WHERE id = v_ha.account_holder_id;

  SELECT id INTO v_acc_id FROM public.accounts
    WHERE account_number = v_ha.account_number AND kind = 'customer' LIMIT 1;
  IF v_acc_id IS NOT NULL THEN RETURN v_acc_id; END IF;

  v_nature := CASE WHEN lower(coalesce(v_ha.account_nature,'credit')) = 'debit'
                   THEN 'debit'::public.account_nature
                   ELSE 'credit'::public.account_nature END;

  INSERT INTO public.accounts(name, kind, nature, account_number, status)
  VALUES (
    coalesce(v_holder.canonical_name, v_ha.account_display_name, v_ha.account_number),
    'customer',
    v_nature,
    v_ha.account_number,
    'active'
  )
  RETURNING id INTO v_acc_id;

  INSERT INTO public.account_balances(account_id, currency, balance_minor, debit_limit_minor)
  VALUES (v_acc_id, v_ha.currency_code::public.currency_code,
          (coalesce(v_ha.current_balance,0) * 100)::bigint, 0)
  ON CONFLICT (account_id, currency) DO NOTHING;

  RETURN v_acc_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_customer_account_for_holder_account(bigint) TO authenticated;