
-- ============= Part A: holder_accounts withdraw limit columns =============
ALTER TABLE public.holder_accounts
  ADD COLUMN IF NOT EXISTS withdraw_limit_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS withdraw_limit_amount numeric NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='holder_accounts_withdraw_limit_amount_nonneg') THEN
    ALTER TABLE public.holder_accounts
      ADD CONSTRAINT holder_accounts_withdraw_limit_amount_nonneg CHECK (withdraw_limit_amount >= 0);
  END IF;
END $$;

-- Limit-change audit
CREATE TABLE IF NOT EXISTS public.holder_account_limit_events (
  id bigserial PRIMARY KEY,
  holder_account_id bigint NOT NULL,
  actor_user_id uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  prev_enabled boolean NOT NULL,
  new_enabled boolean NOT NULL,
  prev_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  note text
);
ALTER TABLE public.holder_account_limit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "limit_events staff read" ON public.holder_account_limit_events;
CREATE POLICY "limit_events staff read" ON public.holder_account_limit_events
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- View
CREATE OR REPLACE VIEW public.v_holder_account_withdraw_limits AS
SELECT id AS holder_account_id, account_number, currency_code, current_balance,
       withdraw_limit_enabled, withdraw_limit_amount,
       (current_balance + CASE WHEN withdraw_limit_enabled THEN withdraw_limit_amount ELSE 0 END)
         AS available_to_withdraw
FROM public.holder_accounts;

-- Set limit RPC
CREATE OR REPLACE FUNCTION public.sp_set_holder_withdraw_limit(
  p_holder_account_id bigint, p_enabled boolean, p_amount numeric, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_prev public.holder_accounts;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Amount must be >= 0'; END IF;
  SELECT * INTO v_prev FROM public.holder_accounts WHERE id = p_holder_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Holder account not found'; END IF;

  UPDATE public.holder_accounts
    SET withdraw_limit_enabled = COALESCE(p_enabled,false),
        withdraw_limit_amount = p_amount,
        updated_at = now()
    WHERE id = p_holder_account_id;

  INSERT INTO public.holder_account_limit_events(
    holder_account_id, actor_user_id, prev_enabled, new_enabled, prev_amount, new_amount, note)
  VALUES (p_holder_account_id, v_uid, v_prev.withdraw_limit_enabled, COALESCE(p_enabled,false),
          v_prev.withdraw_limit_amount, p_amount, NULLIF(btrim(p_note),''));

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (v_uid, 'holder_account.set_withdraw_limit', v_prev.account_number,
    jsonb_build_object('enabled', p_enabled, 'amount', p_amount, 'note', p_note));
END $$;

-- ============= Part C: transactions review fields =============
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS requested_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS partial_approved boolean NOT NULL DEFAULT false;

-- Updated post_transaction with review_reason routing
CREATE OR REPLACE FUNCTION public.post_transaction(
  p_customer_account_id uuid, p_currency currency_code, p_direction tx_direction,
  p_channel vault_channel, p_amount_minor bigint, p_comment text
) RETURNS transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vault public.accounts; v_customer public.accounts;
  v_cust_bal public.account_balances; v_vault_bal public.account_balances;
  v_status public.tx_status; v_tx public.transactions; v_tx_num text;
  v_customer_side public.entry_side; v_vault_side public.entry_side;
  v_cust_delta bigint; v_vault_delta bigint;
  v_holder public.holder_accounts;
  v_avail_minor bigint;
  v_review_reason text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'teller') OR public.has_role(v_uid,'admin')) THEN
    RAISE EXCEPTION 'Only tellers or admins can post transactions';
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF p_comment IS NULL OR length(btrim(p_comment)) < 3 THEN RAISE EXCEPTION 'A comment of at least 3 characters is required'; END IF;

  SELECT * INTO v_customer FROM public.accounts WHERE id = p_customer_account_id AND kind='customer';
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer account not found'; END IF;

  SELECT a.* INTO v_vault FROM public.accounts a
   JOIN public.account_balances b ON b.account_id = a.id
   WHERE a.kind='vault' AND a.vault_channel = p_channel AND b.currency = p_currency
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vault for % %/% not found', p_channel, p_currency, p_currency; END IF;

  SELECT * INTO v_cust_bal FROM public.account_balances
    WHERE account_id = v_customer.id AND currency = p_currency FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.account_balances(account_id, currency, balance_minor, debit_limit_minor)
    VALUES (v_customer.id, p_currency, 0, 0) RETURNING * INTO v_cust_bal;
  END IF;
  SELECT * INTO v_vault_bal FROM public.account_balances
    WHERE account_id = v_vault.id AND currency = p_currency FOR UPDATE;

  IF p_direction = 'deposit' THEN
    v_customer_side := 'credit'; v_vault_side := 'debit';
  ELSE
    v_customer_side := 'debit'; v_vault_side := 'credit';
  END IF;

  v_cust_delta := CASE WHEN v_customer.nature::text = v_customer_side::text THEN p_amount_minor ELSE -p_amount_minor END;
  v_vault_delta := CASE WHEN v_vault.nature::text = v_vault_side::text THEN p_amount_minor ELSE -p_amount_minor END;

  v_status := 'posted';
  v_review_reason := NULL;

  IF p_direction = 'withdraw' THEN
    -- Look up holder withdraw limit for this customer's account_number
    SELECT * INTO v_holder FROM public.holder_accounts
      WHERE account_number = v_customer.account_number
        AND currency_code = p_currency::text
      LIMIT 1;
    IF FOUND THEN
      v_avail_minor := (v_cust_bal.balance_minor)
        + CASE WHEN v_holder.withdraw_limit_enabled THEN (v_holder.withdraw_limit_amount * 100)::bigint ELSE 0 END;
    ELSE
      v_avail_minor := v_cust_bal.balance_minor;
    END IF;

    IF p_amount_minor > v_avail_minor THEN
      v_status := 'pending';
      IF v_holder.withdraw_limit_enabled THEN
        v_review_reason := 'exceeds_withdraw_limit';
      ELSE
        v_review_reason := 'insufficient_balance';
      END IF;
    ELSIF v_cust_bal.balance_minor + v_cust_delta < 0 THEN
      -- Within configured buffer but would overdraft balance
      v_status := 'pending';
      v_review_reason := 'over_limit_with_buffer';
    ELSIF v_cust_bal.debit_limit_minor > 0 AND p_amount_minor > v_cust_bal.debit_limit_minor THEN
      v_status := 'pending';
      v_review_reason := 'exceeds_withdraw_limit';
    END IF;
  END IF;

  v_tx_num := 'TX-' || lpad(nextval('public.tx_number_seq')::text, 6, '0');

  INSERT INTO public.transactions(
    tx_number, customer_account_id, vault_account_id, currency, direction,
    channel, amount_minor, requested_amount_minor, review_reason,
    comment, status, created_by_user_id, posted_at
  ) VALUES (
    v_tx_num, v_customer.id, v_vault.id, p_currency, p_direction,
    p_channel, p_amount_minor, p_amount_minor, v_review_reason,
    btrim(p_comment), v_status, v_uid,
    CASE WHEN v_status='posted' THEN now() ELSE NULL END
  ) RETURNING * INTO v_tx;

  IF v_status = 'posted' THEN
    INSERT INTO public.ledger_entries(transaction_id, account_id, side, amount_minor, currency)
    VALUES (v_tx.id, v_customer.id, v_customer_side, p_amount_minor, p_currency),
           (v_tx.id, v_vault.id, v_vault_side, p_amount_minor, p_currency);
    UPDATE public.account_balances SET balance_minor = balance_minor + v_cust_delta
      WHERE account_id = v_customer.id AND currency = p_currency;
    UPDATE public.account_balances SET balance_minor = balance_minor + v_vault_delta
      WHERE account_id = v_vault.id AND currency = p_currency;
  END IF;

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (v_uid,
          CASE WHEN v_status='posted' THEN 'tx.post' ELSE 'tx.submit_for_approval' END,
          v_tx.tx_number,
          jsonb_build_object('direction', p_direction, 'channel', p_channel,
            'currency', p_currency, 'amount_minor', p_amount_minor, 'review_reason', v_review_reason));
  RETURN v_tx;
END $$;

-- Partial-aware approve_transaction
CREATE OR REPLACE FUNCTION public.approve_transaction(
  p_tx_id uuid, p_approved_amount_minor bigint DEFAULT NULL
) RETURNS transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tx public.transactions;
  v_customer public.accounts; v_vault public.accounts;
  v_customer_side public.entry_side; v_vault_side public.entry_side;
  v_cust_delta bigint; v_vault_delta bigint;
  v_approved bigint;
  v_partial boolean := false;
  v_holder public.holder_accounts;
  v_cust_bal public.account_balances;
  v_avail_minor bigint;
  v_override boolean := false;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND OR v_tx.status <> 'pending' THEN RAISE EXCEPTION 'Not pending'; END IF;

  v_approved := COALESCE(p_approved_amount_minor, v_tx.amount_minor);
  IF v_approved <= 0 THEN RAISE EXCEPTION 'Approved amount must be positive'; END IF;
  IF v_approved > COALESCE(v_tx.requested_amount_minor, v_tx.amount_minor) THEN
    RAISE EXCEPTION 'Approved amount cannot exceed requested';
  END IF;
  IF v_approved < COALESCE(v_tx.requested_amount_minor, v_tx.amount_minor) THEN
    v_partial := true;
  END IF;

  SELECT * INTO v_customer FROM public.accounts WHERE id = v_tx.customer_account_id;
  SELECT * INTO v_vault FROM public.accounts WHERE id = v_tx.vault_account_id;

  IF v_tx.direction = 'deposit' THEN
    v_customer_side := 'credit'; v_vault_side := 'debit';
  ELSE
    v_customer_side := 'debit'; v_vault_side := 'credit';
  END IF;

  -- Re-validate for withdrawals; admin can override (audit logged)
  IF v_tx.direction = 'withdraw' THEN
    SELECT * INTO v_cust_bal FROM public.account_balances
      WHERE account_id = v_customer.id AND currency = v_tx.currency FOR UPDATE;
    SELECT * INTO v_holder FROM public.holder_accounts
      WHERE account_number = v_customer.account_number AND currency_code = v_tx.currency::text LIMIT 1;
    IF FOUND THEN
      v_avail_minor := v_cust_bal.balance_minor
        + CASE WHEN v_holder.withdraw_limit_enabled THEN (v_holder.withdraw_limit_amount * 100)::bigint ELSE 0 END;
    ELSE
      v_avail_minor := v_cust_bal.balance_minor;
    END IF;
    IF v_approved > v_avail_minor THEN v_override := true; END IF;
  END IF;

  v_cust_delta := CASE WHEN v_customer.nature::text = v_customer_side::text THEN v_approved ELSE -v_approved END;
  v_vault_delta := CASE WHEN v_vault.nature::text = v_vault_side::text THEN v_approved ELSE -v_approved END;

  INSERT INTO public.ledger_entries(transaction_id, account_id, side, amount_minor, currency)
  VALUES (v_tx.id, v_customer.id, v_customer_side, v_approved, v_tx.currency),
         (v_tx.id, v_vault.id, v_vault_side, v_approved, v_tx.currency);

  UPDATE public.account_balances SET balance_minor = balance_minor + v_cust_delta
    WHERE account_id = v_customer.id AND currency = v_tx.currency;
  UPDATE public.account_balances SET balance_minor = balance_minor + v_vault_delta
    WHERE account_id = v_vault.id AND currency = v_tx.currency;

  UPDATE public.transactions
    SET status='posted', approved_by_user_id = v_uid, posted_at = now(),
        amount_minor = v_approved, partial_approved = v_partial
    WHERE id = v_tx.id RETURNING * INTO v_tx;

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (v_uid,
    CASE WHEN v_override THEN 'tx.override_approve'
         WHEN v_partial THEN 'tx.partial_approve'
         ELSE 'tx.approve' END,
    v_tx.tx_number,
    jsonb_build_object('approved_minor', v_approved,
      'requested_minor', v_tx.requested_amount_minor,
      'review_reason', v_tx.review_reason, 'override', v_override));
  RETURN v_tx;
END $$;

-- ============= Part B: admin user RPCs =============
CREATE OR REPLACE FUNCTION public.admin_change_user_email(p_target_user uuid, p_new_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $$
DECLARE v_uid uuid := auth.uid(); v_email text := lower(btrim(p_new_email)); v_old text;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid email'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email AND id <> p_target_user) THEN
    RAISE EXCEPTION 'Email already in use';
  END IF;
  SELECT email INTO v_old FROM auth.users WHERE id = p_target_user;
  IF v_old IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  UPDATE auth.users
    SET email = v_email, email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
    WHERE id = p_target_user;

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (v_uid, 'user.email_change', p_target_user::text,
    jsonb_build_object('old_email', v_old, 'new_email', v_email));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_holder_owner(p_holder_id bigint, p_owner uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_prev uuid; v_dahab text;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT owner_user_id, dahab_account_number INTO v_prev, v_dahab
    FROM public.account_holders WHERE id = p_holder_id;
  IF v_dahab IS NULL THEN RAISE EXCEPTION 'Holder not found'; END IF;

  UPDATE public.account_holders SET owner_user_id = p_owner, updated_at = now()
    WHERE id = p_holder_id;

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (v_uid, CASE WHEN p_owner IS NULL THEN 'holder.unlink_owner' ELSE 'holder.set_owner' END,
    v_dahab, jsonb_build_object('prev_owner', v_prev, 'new_owner', p_owner));
END $$;
