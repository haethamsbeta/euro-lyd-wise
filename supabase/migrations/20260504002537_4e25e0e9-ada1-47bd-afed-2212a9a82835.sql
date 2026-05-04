-- Fix: bridge RPC must create customer accounts as 'credit' nature so the
-- overdraft / approval logic in post_transaction works correctly.
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

  -- Customer accounts are liabilities of the institution → always 'credit' nature.
  -- This matches _upsert_customer and ensures post_transaction's overdraft check
  -- routes risky withdrawals to the pending-approval queue.
  INSERT INTO public.accounts(name, kind, nature, account_number, status)
  VALUES (
    coalesce(v_holder.canonical_name, v_ha.account_display_name, v_ha.account_number),
    'customer',
    'credit'::public.account_nature,
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

-- Repair any customer accounts already bridged with the wrong nature.
-- Safe: only flips 'debit' → 'credit' on customer-kind rows that were created
-- from a holder card (i.e. their account_number matches a holder_accounts row).
UPDATE public.accounts a
   SET nature = 'credit'::public.account_nature
 WHERE a.kind = 'customer'
   AND a.nature = 'debit'::public.account_nature
   AND EXISTS (
     SELECT 1 FROM public.holder_accounts ha
      WHERE ha.account_number = a.account_number
   );