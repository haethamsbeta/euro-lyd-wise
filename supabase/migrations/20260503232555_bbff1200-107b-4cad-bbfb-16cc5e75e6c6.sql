-- Linked accounts import: trust DAHAB # from file
ALTER TABLE public.holder_accounts
  ADD COLUMN IF NOT EXISTS dahab_account_number varchar;

CREATE INDEX IF NOT EXISTS idx_holder_accounts_dahab ON public.holder_accounts(dahab_account_number);

ALTER TABLE public.account_import_staging
  ADD COLUMN IF NOT EXISTS dahab_account_number varchar,
  ADD COLUMN IF NOT EXISTS account_alias_name text,
  ADD COLUMN IF NOT EXISTS is_primary_account boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS canonical_name_candidate text;

CREATE OR REPLACE FUNCTION public.import_linked_accounts_batch(p_batch_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  r RECORD;
  v_holder_id bigint;
  v_created_holders int := 0;
  v_linked_accounts int := 0;
  v_skipped int := 0;
  v_max_seq bigint := 0;
  v_n bigint;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  -- Bump DAHAB sequence past max numeric suffix in this batch
  FOR v_n IN
    SELECT MAX(NULLIF(regexp_replace(dahab_account_number, '\D', '', 'g'), '')::bigint)
    FROM public.account_import_staging
    WHERE import_batch_id = p_batch_id AND dahab_account_number IS NOT NULL
  LOOP
    v_max_seq := COALESCE(v_n, 0);
  END LOOP;
  IF v_max_seq > 0 THEN
    PERFORM setval('public.dahab_holder_seq', GREATEST(v_max_seq, (SELECT last_value FROM public.dahab_holder_seq)));
  END IF;

  FOR r IN
    SELECT * FROM public.account_import_staging
    WHERE import_batch_id = p_batch_id
      AND review_status = 'PENDING'
      AND dahab_account_number IS NOT NULL
      AND source_account_number IS NOT NULL
      AND extracted_currency_code IS NOT NULL
      AND raw_name IS NOT NULL
    ORDER BY id
  LOOP
    -- Upsert holder by DAHAB #
    SELECT id INTO v_holder_id FROM public.account_holders
      WHERE dahab_account_number = r.dahab_account_number LIMIT 1;
    IF v_holder_id IS NULL THEN
      INSERT INTO public.account_holders(dahab_account_number, canonical_name, normalized_name)
        VALUES (
          r.dahab_account_number,
          COALESCE(r.canonical_name_candidate, r.base_name_candidate, r.raw_name),
          COALESCE(r.normalized_name_candidate, r.base_name_candidate, r.raw_name)
        )
        RETURNING id INTO v_holder_id;
      v_created_holders := v_created_holders + 1;
    END IF;

    -- Skip if account_number already linked
    IF EXISTS (SELECT 1 FROM public.holder_accounts WHERE account_number = r.source_account_number) THEN
      UPDATE public.account_import_staging
        SET review_status='SKIPPED', error_message='Duplicate account_number'
        WHERE id = r.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.holder_accounts(
      account_number, account_holder_id, dahab_account_number, currency_code,
      account_nature, account_display_name, account_alias_name, is_primary_account
    ) VALUES (
      r.source_account_number, v_holder_id, r.dahab_account_number, r.extracted_currency_code,
      COALESCE(r.nature,'Debit'), r.raw_name, r.account_alias_name, COALESCE(r.is_primary_account, false)
    );
    v_linked_accounts := v_linked_accounts + 1;

    UPDATE public.account_import_staging
      SET review_status='IMPORTED', suggested_account_holder_id = v_holder_id
      WHERE id = r.id;
  END LOOP;

  UPDATE public.account_import_batches
    SET status='APPROVED', successful_rows = v_linked_accounts
    WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'created_holders', v_created_holders,
    'linked_accounts', v_linked_accounts,
    'skipped', v_skipped
  );
END;
$function$;