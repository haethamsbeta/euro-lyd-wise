-- DAHAB — Smoke tests. Run as `dahab_app` (after seed) so RLS + GRANTs are
-- exercised exactly as the API layer will hit them at runtime.
--   SET app.current_user_id = '11111111-1111-1111-1111-111111111111'; -- demo admin
\set ON_ERROR_STOP on
\set admin '11111111-1111-1111-1111-111111111111'

-- 1. Schema basics
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM pg_type WHERE typname='currency_code')=1, 'enum currency_code missing';
  ASSERT (SELECT count(*) FROM information_schema.tables WHERE table_name='transactions')=1,'transactions missing';
END $$;

-- 2. Holder + account creation via RPC
SET app.current_user_id = :'admin';
SELECT create_holder_with_accounts(
  'Test Customer','INDIVIDUAL',
  '[{"currency_code":"USD","account_nature":"Debit","account_display_name":"Test — USD"}]'::jsonb,
  NULL, NULL);

-- 3. Post a transaction (deposit) and verify ledger + balance
SELECT post_transaction(
  (SELECT id FROM accounts WHERE kind='customer' LIMIT 1),
  'deposit','cash','USD', 5000, 'unit-test deposit');

DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM ledger_entries WHERE created_at > now() - interval '1 minute';
  ASSERT n >= 2, 'ledger entries not created';
END $$;

-- 4. Approval flow
SELECT post_transaction(
  (SELECT id FROM accounts WHERE kind='customer' LIMIT 1),
  'withdraw','cash','USD', 3000000, 'large withdraw forces pending');

DO $$ DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM transactions WHERE status='pending' ORDER BY created_at DESC LIMIT 1;
  ASSERT v_id IS NOT NULL, 'pending tx not created';
  PERFORM approve_transaction(v_id, NULL);
  ASSERT (SELECT status FROM transactions WHERE id=v_id)='posted', 'approval did not post';
END $$;

-- 5. Reports views return rows
SELECT * FROM report_volume_by_currency_30d;
SELECT * FROM report_currency_distribution;
SELECT * FROM report_consolidated_usd();

-- 5b. Ledger invariants for the test transactions just posted
--     (debits == credits per transaction_id, balance_after sequentially
--     correct per holder account).
DO $$ DECLARE bad int; BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT transaction_id,
           sum(CASE WHEN side='debit'  THEN amount_minor ELSE 0 END) AS d,
           sum(CASE WHEN side='credit' THEN amount_minor ELSE 0 END) AS c
    FROM ledger_entries
    WHERE created_at > now() - interval '5 minutes'
    GROUP BY transaction_id
  ) t WHERE t.d <> t.c;
  ASSERT bad = 0, 'ledger imbalance: debits != credits for some transaction';
END $$;

DO $$ DECLARE drift int; BEGIN
  SELECT count(*) INTO drift FROM (
    SELECT account_id, currency,
           balance_after,
           lag(balance_after) OVER (PARTITION BY account_id, currency ORDER BY id) AS prev,
           amount_minor, side
    FROM holder_ledger_entries
  ) x
  WHERE prev IS NOT NULL
    AND balance_after <> prev + (CASE WHEN side='credit' THEN amount_minor ELSE -amount_minor END);
  ASSERT drift = 0, 'balance_after not sequentially correct per holder account';
END $$;

-- 5c. account_balances reflects sum of signed ledger entries.
DO $$ DECLARE drift int; BEGIN
  SELECT count(*) INTO drift FROM (
    SELECT b.account_id, b.currency, b.balance_minor,
           coalesce(sum(CASE WHEN le.side='credit' THEN le.amount_minor ELSE -le.amount_minor END),0) AS computed
    FROM account_balances b
    LEFT JOIN ledger_entries le
      ON le.account_id = b.account_id AND le.currency = b.currency
    GROUP BY b.account_id, b.currency, b.balance_minor
  ) x WHERE x.balance_minor <> x.computed;
  ASSERT drift = 0, 'account_balances drifted from ledger sum';
END $$;

-- 5d. At least one dashboard/report view returns rows after the test posts.
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM report_cash_flow_daily;
  ASSERT n >= 1, 'report_cash_flow_daily empty after test posts';
END $$;

-- 6. RLS: switch to consumer and confirm scoping
SET app.current_user_id = '44444444-4444-4444-4444-444444444444';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM accounts) >= 1, 'consumer should see their own account';
  ASSERT (SELECT count(*) FROM transactions WHERE customer_account_id NOT IN
          (SELECT id FROM accounts WHERE owner_user_id='44444444-4444-4444-4444-444444444444'::uuid))=0,
    'RLS leak: consumer saw foreign tx';
END $$;
