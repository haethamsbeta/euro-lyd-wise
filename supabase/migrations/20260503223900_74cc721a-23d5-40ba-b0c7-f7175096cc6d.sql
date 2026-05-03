
-- Unique index on holder_accounts.account_number (spec)
CREATE UNIQUE INDEX IF NOT EXISTS ux_holder_accounts_account_number ON public.holder_accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_holder_accounts_holder_currency ON public.holder_accounts(account_holder_id, currency_code);
CREATE INDEX IF NOT EXISTS idx_holder_ledger_account_date ON public.holder_ledger_entries(account_id, posted_at, id);

-- Resolve a review queue row
CREATE OR REPLACE FUNCTION public.resolve_review_row(p_row_id bigint, p_decision jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.account_link_review_queue;
  v_action text := p_decision->>'action'; -- assign | create | reject | set_currency
  v_holder_id bigint;
  v_canonical text;
  v_currency text;
  v_dahab text;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  SELECT * INTO v_row FROM public.account_link_review_queue WHERE id = p_row_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review row not found'; END IF;

  IF v_action = 'reject' THEN
    UPDATE public.account_link_review_queue
       SET review_status='REJECTED', reviewed_by=v_uid, reviewed_at=now(),
           notes = COALESCE(p_decision->>'notes', notes)
     WHERE id = p_row_id;
    UPDATE public.account_import_staging
       SET review_status='REJECTED'
     WHERE id = v_row.staging_id;
    RETURN jsonb_build_object('ok', true, 'action', 'reject');
  END IF;

  v_currency := COALESCE(p_decision->>'currency_code', v_row.extracted_currency_code);
  IF v_currency IS NULL OR v_currency = 'UNK' THEN
    RAISE EXCEPTION 'Currency must be set before linking';
  END IF;

  IF v_action = 'assign' THEN
    v_holder_id := (p_decision->>'holder_id')::bigint;
    IF v_holder_id IS NULL THEN RAISE EXCEPTION 'holder_id required'; END IF;
  ELSIF v_action = 'create' THEN
    v_canonical := COALESCE(p_decision->>'canonical_name', v_row.base_name_candidate, v_row.raw_name);
    v_dahab := public.next_dahab_account_number();
    INSERT INTO public.account_holders(dahab_account_number, canonical_name, normalized_name)
      VALUES (v_dahab, v_canonical, COALESCE(v_row.normalized_name_candidate, v_canonical))
      RETURNING id INTO v_holder_id;
  ELSE
    RAISE EXCEPTION 'Unknown action: %', v_action;
  END IF;

  -- Update staging row to be importable on next approve
  UPDATE public.account_import_staging
     SET extracted_currency_code = v_currency,
         suggested_account_holder_id = v_holder_id,
         review_status = 'PENDING'
   WHERE id = v_row.staging_id;

  -- Mark review row resolved
  UPDATE public.account_link_review_queue
     SET review_status='RESOLVED', reviewed_by=v_uid, reviewed_at=now(),
         suggested_account_holder_id = v_holder_id,
         extracted_currency_code = v_currency,
         notes = COALESCE(p_decision->>'notes', notes)
   WHERE id = p_row_id;

  RETURN jsonb_build_object('ok', true, 'action', v_action, 'holder_id', v_holder_id);
END;
$$;
