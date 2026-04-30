-- Admin-only "correct transaction" support: reversal + re-post.
-- Posted entries are immutable; corrections happen by reversing the original
-- and posting a new entry, preserving the audit trail and double-entry invariants.

ALTER TYPE public.tx_status ADD VALUE IF NOT EXISTS 'reversed';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reverses_tx_id uuid REFERENCES public.transactions(id),
  ADD COLUMN IF NOT EXISTS corrected_by_tx_id uuid REFERENCES public.transactions(id),
  ADD COLUMN IF NOT EXISTS correction_reason text;

CREATE INDEX IF NOT EXISTS idx_tx_reverses ON public.transactions(reverses_tx_id);
CREATE INDEX IF NOT EXISTS idx_tx_corrected_by ON public.transactions(corrected_by_tx_id);

CREATE OR REPLACE FUNCTION public.correct_transaction(
  p_tx_id uuid,
  p_new_amount_minor bigint,
  p_new_comment text,
  p_correction_reason text
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_orig public.transactions;
  v_customer public.accounts;
  v_vault public.accounts;
  v_cust_bal public.account_balances;
  v_orig_cust_side public.entry_side;
  v_orig_vault_side public.entry_side;
  v_rev_cust_side public.entry_side;
  v_rev_vault_side public.entry_side;
  v_cust_undo_delta bigint;
  v_vault_undo_delta bigint;
  v_rev_tx_num text;
  v_rev_tx public.transactions;
  v_new_cust_side public.entry_side;
  v_new_vault_side public.entry_side;
  v_new_cust_delta bigint;
  v_new_vault_delta bigint;
  v_new_status public.tx_status;
  v_new_tx_num text;
  v_new_tx public.transactions;
  v_reason text := btrim(coalesce(p_correction_reason, ''));
  v_new_comment text := btrim(coalesce(p_new_comment, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Only admins can correct transactions';
  END IF;
  IF p_new_amount_minor IS NULL OR p_new_amount_minor <= 0 THEN
    RAISE EXCEPTION 'New amount must be positive';
  END IF;
  IF length(v_new_comment) < 3 THEN
    RAISE EXCEPTION 'A new comment of at least 3 characters is required';
  END IF;
  IF length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A correction reason of at least 10 characters is required';
  END IF;

  SELECT * INTO v_orig FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_orig.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted transactions can be corrected (current status: %)', v_orig.status;
  END IF;
  IF v_orig.reverses_tx_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot correct a reversing entry';
  END IF;
  IF v_orig.corrected_by_tx_id IS NOT NULL THEN
    RAISE EXCEPTION 'This entry has already been corrected';
  END IF;

  SELECT * INTO v_customer FROM public.accounts WHERE id = v_orig.customer_account_id FOR UPDATE;
  SELECT * INTO v_vault FROM public.accounts WHERE id = v_orig.vault_account_id FOR UPDATE;

  IF v_orig.direction = 'deposit' THEN
    v_orig_cust_side := 'credit'; v_orig_vault_side := 'debit';
  ELSE
    v_orig_cust_side := 'debit';  v_orig_vault_side := 'credit';
  END IF;

  v_rev_cust_side  := CASE WHEN v_orig_cust_side  = 'debit' THEN 'credit'::entry_side ELSE 'debit'::entry_side END;
  v_rev_vault_side := CASE WHEN v_orig_vault_side = 'debit' THEN 'credit'::entry_side ELSE 'debit'::entry_side END;

  v_cust_undo_delta  := CASE WHEN v_customer.nature::text = v_rev_cust_side::text  THEN v_orig.amount_minor ELSE -v_orig.amount_minor END;
  v_vault_undo_delta := CASE WHEN v_vault.nature::text    = v_rev_vault_side::text THEN v_orig.amount_minor ELSE -v_orig.amount_minor END;

  v_rev_tx_num := 'RV-' || lpad(nextval('public.tx_number_seq')::text, 6, '0');
  INSERT INTO public.transactions(
    tx_number, customer_account_id, vault_account_id, currency, direction,
    channel, amount_minor, comment, status, created_by_user_id, posted_at,
    reverses_tx_id, correction_reason
  ) VALUES (
    v_rev_tx_num, v_customer.id, v_vault.id, v_orig.currency, v_orig.direction,
    v_orig.channel, v_orig.amount_minor,
    'Reversal of ' || v_orig.tx_number || ' — ' || v_reason,
    'reversed', v_uid, now(),
    v_orig.id, v_reason
  ) RETURNING * INTO v_rev_tx;

  INSERT INTO public.ledger_entries(transaction_id, account_id, side, amount_minor, currency)
  VALUES
    (v_rev_tx.id, v_customer.id, v_rev_cust_side,  v_orig.amount_minor, v_orig.currency),
    (v_rev_tx.id, v_vault.id,    v_rev_vault_side, v_orig.amount_minor, v_orig.currency);

  UPDATE public.account_balances
     SET balance_minor = balance_minor + v_cust_undo_delta
   WHERE account_id = v_customer.id AND currency = v_orig.currency;
  UPDATE public.account_balances
     SET balance_minor = balance_minor + v_vault_undo_delta
   WHERE account_id = v_vault.id AND currency = v_orig.currency;

  UPDATE public.transactions
     SET status = 'reversed', correction_reason = v_reason
   WHERE id = v_orig.id;

  IF v_orig.direction = 'deposit' THEN
    v_new_cust_side := 'credit'; v_new_vault_side := 'debit';
  ELSE
    v_new_cust_side := 'debit';  v_new_vault_side := 'credit';
  END IF;

  v_new_cust_delta  := CASE WHEN v_customer.nature::text = v_new_cust_side::text  THEN p_new_amount_minor ELSE -p_new_amount_minor END;
  v_new_vault_delta := CASE WHEN v_vault.nature::text    = v_new_vault_side::text THEN p_new_amount_minor ELSE -p_new_amount_minor END;

  v_new_status := 'posted';
  IF v_orig.direction = 'withdraw' THEN
    SELECT * INTO v_cust_bal FROM public.account_balances
     WHERE account_id = v_customer.id AND currency = v_orig.currency FOR UPDATE;
    IF v_cust_bal.balance_minor + v_new_cust_delta < 0 THEN
      v_new_status := 'pending';
    ELSIF v_cust_bal.debit_limit_minor > 0 AND p_new_amount_minor > v_cust_bal.debit_limit_minor THEN
      v_new_status := 'pending';
    END IF;
  END IF;

  v_new_tx_num := 'TX-' || lpad(nextval('public.tx_number_seq')::text, 6, '0');
  INSERT INTO public.transactions(
    tx_number, customer_account_id, vault_account_id, currency, direction,
    channel, amount_minor, comment, status, created_by_user_id, posted_at,
    correction_reason
  ) VALUES (
    v_new_tx_num, v_customer.id, v_vault.id, v_orig.currency, v_orig.direction,
    v_orig.channel, p_new_amount_minor,
    v_new_comment,
    v_new_status, v_uid,
    CASE WHEN v_new_status = 'posted' THEN now() ELSE NULL END,
    v_reason
  ) RETURNING * INTO v_new_tx;

  IF v_new_status = 'posted' THEN
    INSERT INTO public.ledger_entries(transaction_id, account_id, side, amount_minor, currency)
    VALUES
      (v_new_tx.id, v_customer.id, v_new_cust_side,  p_new_amount_minor, v_orig.currency),
      (v_new_tx.id, v_vault.id,    v_new_vault_side, p_new_amount_minor, v_orig.currency);

    UPDATE public.account_balances
       SET balance_minor = balance_minor + v_new_cust_delta
     WHERE account_id = v_customer.id AND currency = v_orig.currency;
    UPDATE public.account_balances
       SET balance_minor = balance_minor + v_new_vault_delta
     WHERE account_id = v_vault.id AND currency = v_orig.currency;
  END IF;

  UPDATE public.transactions SET corrected_by_tx_id = v_new_tx.id WHERE id = v_orig.id;

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (
    v_uid, 'tx.reverse', v_orig.tx_number,
    jsonb_build_object(
      'original_tx_number', v_orig.tx_number,
      'reversal_tx_number', v_rev_tx.tx_number,
      'amount_minor', v_orig.amount_minor,
      'currency', v_orig.currency,
      'reason', v_reason
    )
  );
  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (
    v_uid, 'tx.correct', v_new_tx.tx_number,
    jsonb_build_object(
      'original_tx_number', v_orig.tx_number,
      'reversal_tx_number', v_rev_tx.tx_number,
      'corrected_tx_number', v_new_tx.tx_number,
      'old_amount_minor', v_orig.amount_minor,
      'new_amount_minor', p_new_amount_minor,
      'currency', v_orig.currency,
      'new_status', v_new_status,
      'reason', v_reason
    )
  );

  RETURN v_new_tx;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_transaction(uuid, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_transaction(uuid, bigint, text, text) TO authenticated;
