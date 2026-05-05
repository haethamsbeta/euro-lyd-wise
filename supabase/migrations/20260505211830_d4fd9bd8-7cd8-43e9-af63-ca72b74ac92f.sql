
-- Add phone/email to account_holders
ALTER TABLE public.account_holders
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS account_holders_phone_idx ON public.account_holders (phone);
CREATE INDEX IF NOT EXISTS account_holders_email_idx ON public.account_holders (lower(email));

-- One active DAHAB account per linked auth user
CREATE UNIQUE INDEX IF NOT EXISTS account_holders_one_active_per_user
  ON public.account_holders (owner_user_id)
  WHERE owner_user_id IS NOT NULL AND status = 'ACTIVE';

-- Per-holder currency totals (current balance per currency across linked accounts)
CREATE OR REPLACE FUNCTION public.get_holder_currency_totals(p_holder_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_result jsonb;
BEGIN
  SELECT owner_user_id INTO v_owner FROM public.account_holders WHERE id = p_holder_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Holder not found'; END IF;
  IF NOT public.is_staff(v_uid) AND v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.currency), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT ha.currency_code AS currency,
           SUM(ha.current_balance)::numeric AS total_balance,
           COUNT(*) AS account_count,
           COALESCE(SUM(ls.d),0)::numeric AS total_debits,
           COALESCE(SUM(ls.c),0)::numeric AS total_credits
    FROM public.holder_accounts ha
    LEFT JOIN (
      SELECT account_id,
             SUM(debit_amount) AS d,
             SUM(credit_amount) AS c
      FROM public.holder_ledger_entries
      GROUP BY account_id
    ) ls ON ls.account_id = ha.id
    WHERE ha.account_holder_id = p_holder_id
    GROUP BY ha.currency_code
  ) t;

  RETURN v_result;
END;
$$;

-- Extend create_holder_with_accounts with optional phone/email (overload-safe replacement)
CREATE OR REPLACE FUNCTION public.create_holder_with_accounts(
  p_canonical_name text,
  p_holder_type text,
  p_accounts jsonb,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_holder_id bigint;
  v_dahab text;
  v_acc jsonb;
  v_count int := 0;
  v_name text := btrim(coalesce(p_canonical_name,''));
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF length(v_name) < 2 THEN RAISE EXCEPTION 'Holder name is required'; END IF;
  IF p_accounts IS NULL OR jsonb_typeof(p_accounts) <> 'array' OR jsonb_array_length(p_accounts) < 1 THEN
    RAISE EXCEPTION 'At least one linked account is required';
  END IF;

  v_dahab := public.next_dahab_account_number();
  INSERT INTO public.account_holders(dahab_account_number, canonical_name, normalized_name, holder_type, phone, email)
    VALUES (v_dahab, v_name, lower(v_name),
            COALESCE(NULLIF(btrim(p_holder_type),''),'INDIVIDUAL'),
            NULLIF(btrim(p_phone),''),
            NULLIF(btrim(p_email),''))
    RETURNING id INTO v_holder_id;

  FOR v_acc IN SELECT * FROM jsonb_array_elements(p_accounts) LOOP
    IF COALESCE(btrim(v_acc->>'account_number'),'') = '' THEN
      RAISE EXCEPTION 'Account number is required for every linked account';
    END IF;
    IF COALESCE(btrim(v_acc->>'currency_code'),'') = '' THEN
      RAISE EXCEPTION 'Currency code is required for every linked account';
    END IF;
    INSERT INTO public.holder_accounts(
      account_number, account_holder_id, dahab_account_number, currency_code,
      account_nature, account_display_name, account_alias_name, is_primary_account
    ) VALUES (
      btrim(v_acc->>'account_number'),
      v_holder_id,
      v_dahab,
      upper(btrim(v_acc->>'currency_code')),
      COALESCE(NULLIF(btrim(v_acc->>'account_nature'),''),'Debit'),
      COALESCE(NULLIF(btrim(v_acc->>'account_display_name'),''), v_name),
      NULLIF(btrim(v_acc->>'account_alias_name'),''),
      COALESCE((v_acc->>'is_primary_account')::boolean, false)
    );
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (v_uid, 'holder.create', v_dahab, jsonb_build_object('holder_id', v_holder_id, 'accounts', v_count));

  RETURN jsonb_build_object('holder_id', v_holder_id, 'dahab_account_number', v_dahab, 'accounts_created', v_count);
END;
$$;
