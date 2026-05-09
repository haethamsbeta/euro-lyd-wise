-- DAHAB — Smoke tests. Run as dahab_app (after seed) with
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

-- 6. RLS: switch to consumer and confirm scoping
SET app.current_user_id = '44444444-4444-4444-4444-444444444444';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM accounts) >= 1, 'consumer should see their own account';
  ASSERT (SELECT count(*) FROM transactions WHERE customer_account_id NOT IN
          (SELECT id FROM accounts WHERE owner_user_id='44444444-4444-4444-4444-444444444444'::uuid))=0,
    'RLS leak: consumer saw foreign tx';
END $$;
