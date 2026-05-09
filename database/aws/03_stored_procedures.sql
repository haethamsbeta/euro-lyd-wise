-- DAHAB — Stored procedures the frontend already calls.
-- All write paths must go through these; raw INSERT on transactions/ledger is denied (see 05_permissions.sql).

------------------------------------------------------------------------------
-- Numbering helpers
------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_dahab_account_number START 100001;
CREATE OR REPLACE FUNCTION next_dahab_account_number() RETURNS TEXT
LANGUAGE sql AS $$ SELECT 'DH-' || lpad(nextval('seq_dahab_account_number')::text, 6, '0') $$;

CREATE SEQUENCE IF NOT EXISTS seq_holder_account_number START 1;
CREATE OR REPLACE FUNCTION next_holder_account_number(p_dahab TEXT, p_currency TEXT) RETURNS TEXT
LANGUAGE sql AS $$ SELECT p_dahab || '-' || p_currency || '-' || lpad(nextval('seq_holder_account_number')::text, 4, '0') $$;

CREATE SEQUENCE IF NOT EXISTS seq_tx_number START 1;
CREATE OR REPLACE FUNCTION next_tx_number() RETURNS TEXT
LANGUAGE sql AS $$ SELECT 'TX-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('seq_tx_number')::text, 6, '0') $$;

------------------------------------------------------------------------------
-- create_holder_with_accounts
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_holder_with_accounts(
  p_canonical_name TEXT, p_holder_type TEXT, p_accounts JSONB,
  p_phone TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_holder_id BIGINT; v_dahab TEXT; acc JSONB; v_acct_id BIGINT;
        v_acct_ids BIGINT[] := ARRAY[]::BIGINT[];
BEGIN
  IF NOT has_role(current_user_id(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_dahab := next_dahab_account_number();
  INSERT INTO account_holders (dahab_account_number, canonical_name, normalized_name, holder_type, phone, email)
  VALUES (v_dahab, p_canonical_name, lower(trim(p_canonical_name)), p_holder_type, p_phone, p_email)
  RETURNING id INTO v_holder_id;

  FOR acc IN SELECT * FROM jsonb_array_elements(p_accounts) LOOP
    INSERT INTO holder_accounts (account_holder_id, account_number, account_display_name,
                                 account_alias_name, currency_code, account_nature,
                                 dahab_account_number, is_primary_account)
    VALUES (v_holder_id,
            next_holder_account_number(v_dahab, acc->>'currency_code'),
            acc->>'account_display_name',
            acc->>'account_alias_name',
            acc->>'currency_code',
            acc->>'account_nature',
            v_dahab,
            COALESCE((acc->>'is_primary_account')::boolean, false))
    RETURNING id INTO v_acct_id;
    v_acct_ids := v_acct_ids || v_acct_id;
  END LOOP;

  INSERT INTO audit_log(actor_user_id, action, target, details)
  VALUES (current_user_id(),'holder.create', v_dahab,
          jsonb_build_object('holder_id', v_holder_id, 'accounts', v_acct_ids));

  RETURN jsonb_build_object('holder_id', v_holder_id, 'dahab_account_number', v_dahab,
                             'account_ids', to_jsonb(v_acct_ids));
END $$;

------------------------------------------------------------------------------
-- add_account_to_holder
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_account_to_holder(p_holder_id BIGINT, p_account JSONB)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_acct_id BIGINT; v_dahab TEXT;
BEGIN
  IF NOT has_role(current_user_id(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT dahab_account_number INTO v_dahab FROM account_holders WHERE id = p_holder_id;
  IF v_dahab IS NULL THEN RAISE EXCEPTION 'holder not found'; END IF;

  INSERT INTO holder_accounts (account_holder_id, account_number, account_display_name,
                               account_alias_name, currency_code, account_nature,
                               dahab_account_number, is_primary_account)
  VALUES (p_holder_id,
          next_holder_account_number(v_dahab, p_account->>'currency_code'),
          p_account->>'account_display_name',
          p_account->>'account_alias_name',
          p_account->>'currency_code',
          p_account->>'account_nature',
          v_dahab,
          COALESCE((p_account->>'is_primary_account')::boolean,false))
  RETURNING id INTO v_acct_id;

  INSERT INTO audit_log(actor_user_id, action, target, details)
  VALUES (current_user_id(),'holder_account.create', v_dahab,
          jsonb_build_object('holder_id', p_holder_id, 'account_id', v_acct_id));
  RETURN v_acct_id;
END $$;

------------------------------------------------------------------------------
-- post_transaction
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION post_transaction(
  p_customer_account_id UUID, p_direction tx_direction, p_channel vault_channel,
  p_currency currency_code, p_amount_minor BIGINT, p_comment TEXT
) RETURNS transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_vault_id UUID; v_tx transactions; v_status tx_status; v_review TEXT;
        v_threshold BIGINT := 25000 * 100; -- 25,000 default approval threshold
        v_user UUID := current_user_id();
BEGIN
  IF v_user IS NULL OR NOT is_staff(v_user) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(coalesce(p_comment,'')) < 3 OR length(p_comment) > 280 THEN
    RAISE EXCEPTION 'comment must be 3..280 chars';
  END IF;
  IF p_amount_minor <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;

  -- Pick the matching vault for channel+currency
  SELECT a.id INTO v_vault_id FROM accounts a
  WHERE a.kind='vault' AND a.vault_channel=p_channel
  ORDER BY a.created_at LIMIT 1;
  IF v_vault_id IS NULL THEN RAISE EXCEPTION 'no % vault configured', p_channel; END IF;

  IF p_amount_minor >= v_threshold THEN
    v_status := 'pending';
    v_review := 'amount above auto-approval threshold';
  ELSE
    v_status := 'posted';
  END IF;

  INSERT INTO transactions (tx_number, customer_account_id, vault_account_id,
                            direction, channel, currency, amount_minor,
                            requested_amount_minor, status, comment,
                            review_reason, created_by_user_id, posted_at)
  VALUES (next_tx_number(), p_customer_account_id, v_vault_id,
          p_direction, p_channel, p_currency, p_amount_minor,
          p_amount_minor, v_status, p_comment,
          v_review, v_user, CASE WHEN v_status='posted' THEN now() ELSE NULL END)
  RETURNING * INTO v_tx;

  IF v_status='posted' THEN
    PERFORM apply_ledger(v_tx);
  END IF;

  INSERT INTO audit_log(actor_user_id, action, target, details)
  VALUES (v_user, CASE WHEN v_status='posted' THEN 'tx.post' ELSE 'tx.create' END,
          v_tx.tx_number,
          jsonb_build_object('direction', p_direction,'channel', p_channel,
                             'currency', p_currency,'amount_minor', p_amount_minor));
  RETURN v_tx;
END $$;

CREATE OR REPLACE FUNCTION apply_ledger(p_tx transactions) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_customer_side entry_side; v_vault_side entry_side; v_signed BIGINT;
BEGIN
  IF p_tx.direction='deposit' THEN
    v_customer_side := 'credit'; v_vault_side := 'debit'; v_signed := p_tx.amount_minor;
  ELSE
    v_customer_side := 'debit';  v_vault_side := 'credit'; v_signed := -p_tx.amount_minor;
  END IF;

  INSERT INTO ledger_entries (transaction_id, account_id, amount_minor, side, currency)
  VALUES (p_tx.id, p_tx.customer_account_id, p_tx.amount_minor, v_customer_side, p_tx.currency),
         (p_tx.id, p_tx.vault_account_id,    p_tx.amount_minor, v_vault_side,    p_tx.currency);

  INSERT INTO account_balances(account_id, currency, balance_minor)
  VALUES (p_tx.customer_account_id, p_tx.currency, v_signed)
  ON CONFLICT (account_id, currency) DO UPDATE
    SET balance_minor = account_balances.balance_minor + EXCLUDED.balance_minor;

  INSERT INTO account_balances(account_id, currency, balance_minor)
  VALUES (p_tx.vault_account_id, p_tx.currency, -v_signed)
  ON CONFLICT (account_id, currency) DO UPDATE
    SET balance_minor = account_balances.balance_minor + EXCLUDED.balance_minor;
END $$;

------------------------------------------------------------------------------
-- approve / reject / correct
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_transaction(p_tx_id UUID, p_approved_amount_minor BIGINT DEFAULT NULL)
RETURNS transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tx transactions; v_user UUID := current_user_id();
BEGIN
  IF NOT has_role(v_user,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_tx FROM transactions WHERE id=p_tx_id FOR UPDATE;
  IF v_tx.status <> 'pending' THEN RAISE EXCEPTION 'tx not pending'; END IF;
  IF p_approved_amount_minor IS NOT NULL AND p_approved_amount_minor <> v_tx.amount_minor THEN
    UPDATE transactions SET amount_minor=p_approved_amount_minor, partial_approved=true WHERE id=p_tx_id;
    v_tx.amount_minor := p_approved_amount_minor; v_tx.partial_approved := true;
  END IF;
  UPDATE transactions SET status='posted', posted_at=now(), approved_by_user_id=v_user
   WHERE id=p_tx_id RETURNING * INTO v_tx;
  PERFORM apply_ledger(v_tx);
  INSERT INTO audit_log(actor_user_id, action, target, details)
  VALUES (v_user,'tx.post', v_tx.tx_number,
          jsonb_build_object('approved_amount_minor', v_tx.amount_minor,
                             'partial', v_tx.partial_approved));
  RETURN v_tx;
END $$;

CREATE OR REPLACE FUNCTION reject_transaction(p_tx_id UUID, p_reason TEXT)
RETURNS transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tx transactions; v_user UUID := current_user_id();
BEGIN
  IF NOT has_role(v_user,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE transactions SET status='rejected', reject_reason=p_reason, approved_by_user_id=v_user
   WHERE id=p_tx_id AND status='pending'
  RETURNING * INTO v_tx;
  IF v_tx.id IS NULL THEN RAISE EXCEPTION 'tx not pending'; END IF;
  INSERT INTO audit_log(actor_user_id, action, target, details)
  VALUES (v_user,'tx.reject', v_tx.tx_number, jsonb_build_object('reason', p_reason));
  RETURN v_tx;
END $$;

CREATE OR REPLACE FUNCTION correct_transaction(
  p_tx_id UUID, p_new_amount_minor BIGINT, p_new_comment TEXT, p_correction_reason TEXT
) RETURNS transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_orig transactions; v_rev transactions; v_new transactions; v_user UUID := current_user_id();
BEGIN
  IF NOT has_role(v_user,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_orig FROM transactions WHERE id=p_tx_id;
  IF v_orig.status <> 'posted' THEN RAISE EXCEPTION 'only posted tx can be corrected'; END IF;

  -- 1. Reverse entry
  INSERT INTO transactions (tx_number, customer_account_id, vault_account_id, direction, channel,
                            currency, amount_minor, status, comment, reverses_tx_id,
                            created_by_user_id, posted_at, correction_reason)
  VALUES (next_tx_number(), v_orig.customer_account_id, v_orig.vault_account_id,
          CASE WHEN v_orig.direction='deposit' THEN 'withdraw'::tx_direction ELSE 'deposit'::tx_direction END,
          v_orig.channel, v_orig.currency, v_orig.amount_minor,
          'reversed', 'Reversal of '||v_orig.tx_number, v_orig.id,
          v_user, now(), p_correction_reason)
  RETURNING * INTO v_rev;
  PERFORM apply_ledger(v_rev);

  -- 2. New corrected entry
  INSERT INTO transactions (tx_number, customer_account_id, vault_account_id, direction, channel,
                            currency, amount_minor, status, comment,
                            created_by_user_id, posted_at, correction_reason)
  VALUES (next_tx_number(), v_orig.customer_account_id, v_orig.vault_account_id,
          v_orig.direction, v_orig.channel, v_orig.currency, p_new_amount_minor,
          'posted', p_new_comment, v_user, now(), p_correction_reason)
  RETURNING * INTO v_new;
  PERFORM apply_ledger(v_new);

  UPDATE transactions SET corrected_by_tx_id = v_new.id WHERE id = v_orig.id;

  INSERT INTO audit_log(actor_user_id, action, target, details) VALUES
    (v_user,'tx.reverse', v_orig.tx_number,
     jsonb_build_object('original_tx_number',v_orig.tx_number,'reversal_tx_number',v_rev.tx_number,
                        'amount_minor',v_orig.amount_minor,'currency',v_orig.currency,'reason',p_correction_reason)),
    (v_user,'tx.correct', v_orig.tx_number,
     jsonb_build_object('original_tx_number',v_orig.tx_number,'corrected_tx_number',v_new.tx_number,
                        'old_amount_minor',v_orig.amount_minor,'new_amount_minor',p_new_amount_minor,
                        'currency',v_orig.currency));
  RETURN v_new;
END $$;

------------------------------------------------------------------------------
-- sp_set_holder_withdraw_limit
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_set_holder_withdraw_limit(
  p_holder_account_id BIGINT, p_enabled BOOLEAN, p_amount NUMERIC, p_note TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_prev_amt NUMERIC; v_prev_en BOOLEAN; v_user UUID := current_user_id();
BEGIN
  IF NOT has_role(v_user,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT withdraw_limit_amount, withdraw_limit_enabled INTO v_prev_amt, v_prev_en
  FROM holder_accounts WHERE id=p_holder_account_id FOR UPDATE;
  UPDATE holder_accounts
     SET withdraw_limit_amount=p_amount, withdraw_limit_enabled=p_enabled, updated_at=now()
   WHERE id=p_holder_account_id;
  INSERT INTO holder_account_limit_events
    (holder_account_id, prev_amount, new_amount, prev_enabled, new_enabled, note, actor_user_id)
  VALUES (p_holder_account_id, v_prev_amt, p_amount, v_prev_en, p_enabled, p_note, v_user);
END $$;

------------------------------------------------------------------------------
-- get_holder_currency_totals (used by portal + holder detail)
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_holder_currency_totals(p_holder_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('currency_code', currency_code, 'total', total) ORDER BY currency_code), '[]'::jsonb)
  FROM (SELECT currency_code, sum(current_balance) AS total
        FROM holder_accounts WHERE account_holder_id = p_holder_id
        GROUP BY currency_code) t
$$;

------------------------------------------------------------------------------
-- report_consolidated_usd
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION report_consolidated_usd() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_total BIGINT := 0; v_breakdown JSONB := '[]'::jsonb; v_missing TEXT[] := '{}';
        r RECORD;
BEGIN
  FOR r IN
    SELECT b.currency, sum(b.balance_minor) AS bal, fc.usd_rate, fc.as_of_date
    FROM account_balances b
    JOIN accounts a ON a.id=b.account_id AND a.kind='vault'
    LEFT JOIN fx_rates_current fc ON fc.currency = b.currency
    GROUP BY b.currency, fc.usd_rate, fc.as_of_date
  LOOP
    v_breakdown := v_breakdown || jsonb_build_object(
      'currency', r.currency, 'usd_rate', r.usd_rate, 'rate_date', r.as_of_date);
    IF r.usd_rate IS NULL THEN v_missing := v_missing || r.currency::text;
    ELSE v_total := v_total + (r.bal * r.usd_rate)::bigint; END IF;
  END LOOP;
  RETURN jsonb_build_object('total_usd_minor', v_total, 'breakdown', v_breakdown,
                            'missing_rates', to_jsonb(v_missing),
                            'computed_at', now());
END $$;

------------------------------------------------------------------------------
-- Notification helpers
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notifications_mark_read(p_ids UUID[]) RETURNS INT
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  WITH u AS (UPDATE notifications SET read_at=now()
             WHERE id = ANY(p_ids) AND user_id = current_user_id() AND read_at IS NULL
             RETURNING 1)
  SELECT count(*)::int FROM u
$$;

CREATE OR REPLACE FUNCTION notifications_mark_all_read() RETURNS INT
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  WITH u AS (UPDATE notifications SET read_at=now()
             WHERE user_id = current_user_id() AND read_at IS NULL RETURNING 1)
  SELECT count(*)::int FROM u
$$;

CREATE OR REPLACE FUNCTION clear_must_change_password() RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE profiles SET must_change_password=false WHERE id=current_user_id()
$$;
