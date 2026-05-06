
-- 1. Realign dahab_holder_seq to existing max
DO $$
DECLARE
  v_max int;
BEGIN
  SELECT COALESCE(MAX( (regexp_replace(dahab_account_number, '^DAHAB-', ''))::int ), 0)
    INTO v_max
    FROM public.account_holders
    WHERE dahab_account_number ~ '^DAHAB-\d+$';
  PERFORM setval('public.dahab_holder_seq', GREATEST(v_max, 1));
END $$;

-- 2. Harden next_dahab_account_number to skip collisions
CREATE OR REPLACE FUNCTION public.next_dahab_account_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_candidate text;
  v_tries int := 0;
BEGIN
  LOOP
    v_candidate := 'DAHAB-' || lpad(nextval('public.dahab_holder_seq')::text, 6, '0');
    IF NOT EXISTS (SELECT 1 FROM public.account_holders WHERE dahab_account_number = v_candidate) THEN
      RETURN v_candidate;
    END IF;
    v_tries := v_tries + 1;
    IF v_tries > 10000 THEN RAISE EXCEPTION 'Could not allocate DAHAB number'; END IF;
  END LOOP;
END;
$function$;

-- 3. Helper to auto-generate per-currency holder account numbers
CREATE OR REPLACE FUNCTION public.next_holder_account_number(p_dahab text, p_currency text)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_seq int;
  v_candidate text;
  v_tries int := 0;
BEGIN
  LOOP
    SELECT COALESCE(MAX(
      NULLIF(substring(account_number FROM '-(\d+)$'), '')::int
    ), 0) + 1
      INTO v_seq
      FROM public.holder_accounts
      WHERE dahab_account_number = p_dahab
        AND currency_code = upper(p_currency)
        AND account_number ~ ('^' || p_dahab || '-' || upper(p_currency) || '-\d+$');
    v_candidate := p_dahab || '-' || upper(p_currency) || '-' || lpad(v_seq::text, 3, '0');
    IF NOT EXISTS (SELECT 1 FROM public.holder_accounts WHERE account_number = v_candidate) THEN
      RETURN v_candidate;
    END IF;
    v_tries := v_tries + 1;
    IF v_tries > 1000 THEN RAISE EXCEPTION 'Could not allocate holder account number'; END IF;
  END LOOP;
END;
$function$;

-- 4. Update create_holder_with_accounts to allow blank account_number (auto-gen)
CREATE OR REPLACE FUNCTION public.create_holder_with_accounts(
  p_canonical_name text,
  p_holder_type text,
  p_accounts jsonb,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_holder_id bigint;
  v_dahab text;
  v_acc jsonb;
  v_count int := 0;
  v_name text := btrim(coalesce(p_canonical_name,''));
  v_acc_num text;
  v_currency text;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF length(v_name) < 2 THEN RAISE EXCEPTION 'Holder name is required'; END IF;
  IF p_accounts IS NULL OR jsonb_typeof(p_accounts) <> 'array' OR jsonb_array_length(p_accounts) < 1 THEN
    RAISE EXCEPTION 'At least one linked account is required';
  END IF;

  v_dahab := public.next_dahab_account_number();
  INSERT INTO public.account_holders(dahab_account_number, canonical_name, normalized_name, holder_type, phone, email)
    VALUES (v_dahab, v_name, lower(v_name), COALESCE(NULLIF(btrim(p_holder_type),''),'INDIVIDUAL'),
            NULLIF(btrim(p_phone),''), NULLIF(btrim(p_email),''))
    RETURNING id INTO v_holder_id;

  FOR v_acc IN SELECT * FROM jsonb_array_elements(p_accounts) LOOP
    v_currency := upper(btrim(coalesce(v_acc->>'currency_code','')));
    IF v_currency = '' THEN
      RAISE EXCEPTION 'Currency code is required for every linked account';
    END IF;
    v_acc_num := NULLIF(btrim(coalesce(v_acc->>'account_number','')), '');
    IF v_acc_num IS NULL THEN
      v_acc_num := public.next_holder_account_number(v_dahab, v_currency);
    END IF;
    INSERT INTO public.holder_accounts(
      account_number, account_holder_id, dahab_account_number, currency_code,
      account_nature, account_display_name, account_alias_name, is_primary_account
    ) VALUES (
      v_acc_num, v_holder_id, v_dahab, v_currency,
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
$function$;

-- 5. Update add_account_to_holder for auto-gen
CREATE OR REPLACE FUNCTION public.add_account_to_holder(p_holder_id bigint, p_account jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_holder public.account_holders;
  v_id bigint;
  v_acc_num text;
  v_currency text;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_holder FROM public.account_holders WHERE id = p_holder_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Holder not found'; END IF;
  v_currency := upper(btrim(coalesce(p_account->>'currency_code','')));
  IF v_currency = '' THEN
    RAISE EXCEPTION 'Currency code is required';
  END IF;
  v_acc_num := NULLIF(btrim(coalesce(p_account->>'account_number','')), '');
  IF v_acc_num IS NULL THEN
    v_acc_num := public.next_holder_account_number(v_holder.dahab_account_number, v_currency);
  END IF;

  INSERT INTO public.holder_accounts(
    account_number, account_holder_id, dahab_account_number, currency_code,
    account_nature, account_display_name, account_alias_name, is_primary_account
  ) VALUES (
    v_acc_num, v_holder.id, v_holder.dahab_account_number, v_currency,
    COALESCE(NULLIF(btrim(p_account->>'account_nature'),''),'Debit'),
    COALESCE(NULLIF(btrim(p_account->>'account_display_name'),''), v_holder.canonical_name),
    NULLIF(btrim(p_account->>'account_alias_name'),''),
    COALESCE((p_account->>'is_primary_account')::boolean, false)
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (v_uid, 'holder.add_account', v_holder.dahab_account_number, jsonb_build_object('holder_account_id', v_id));

  RETURN v_id;
END;
$function$;
