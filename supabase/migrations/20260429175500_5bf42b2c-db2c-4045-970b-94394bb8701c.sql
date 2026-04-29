CREATE OR REPLACE FUNCTION public._seed_post_tx(
  p_teller uuid, p_customer uuid, p_vault uuid,
  p_currency currency_code, p_direction tx_direction, p_channel vault_channel,
  p_amount bigint, p_comment text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx_num text; v_tx_id uuid;
  v_cust_side entry_side; v_vault_side entry_side;
  v_cust_nature account_nature; v_vault_nature account_nature;
  v_cust_delta bigint; v_vault_delta bigint;
BEGIN
  IF p_direction = 'deposit' THEN
    v_cust_side := 'credit'; v_vault_side := 'debit';
  ELSE
    v_cust_side := 'debit'; v_vault_side := 'credit';
  END IF;
  SELECT nature INTO v_cust_nature FROM public.accounts WHERE id = p_customer;
  SELECT nature INTO v_vault_nature FROM public.accounts WHERE id = p_vault;
  v_cust_delta := CASE WHEN v_cust_nature::text = v_cust_side::text THEN p_amount ELSE -p_amount END;
  v_vault_delta := CASE WHEN v_vault_nature::text = v_vault_side::text THEN p_amount ELSE -p_amount END;
  v_tx_num := 'TX-' || lpad(nextval('public.tx_number_seq')::text, 6, '0');
  INSERT INTO public.transactions(tx_number, customer_account_id, vault_account_id, currency, direction, channel, amount_minor, comment, status, created_by_user_id, posted_at)
    VALUES (v_tx_num, p_customer, p_vault, p_currency, p_direction, p_channel, p_amount, p_comment, 'posted', p_teller, now())
    RETURNING id INTO v_tx_id;
  INSERT INTO public.ledger_entries(transaction_id, account_id, side, amount_minor, currency)
    VALUES (v_tx_id, p_customer, v_cust_side, p_amount, p_currency),
           (v_tx_id, p_vault, v_vault_side, p_amount, p_currency);
  UPDATE public.account_balances SET balance_minor = balance_minor + v_cust_delta
    WHERE account_id = p_customer AND currency = p_currency;
  UPDATE public.account_balances SET balance_minor = balance_minor + v_vault_delta
    WHERE account_id = p_vault AND currency = p_currency;
END $$;

CREATE OR REPLACE FUNCTION public._seed_pending_tx(
  p_teller uuid, p_customer uuid, p_vault uuid,
  p_currency currency_code, p_direction tx_direction, p_channel vault_channel,
  p_amount bigint, p_comment text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx_num text;
BEGIN
  v_tx_num := 'TX-' || lpad(nextval('public.tx_number_seq')::text, 6, '0');
  INSERT INTO public.transactions(tx_number, customer_account_id, vault_account_id, currency, direction, channel, amount_minor, comment, status, created_by_user_id)
    VALUES (v_tx_num, p_customer, p_vault, p_currency, p_direction, p_channel, p_amount, p_comment, 'pending', p_teller);
END $$;

CREATE OR REPLACE FUNCTION public._upsert_vault(p_name text, p_ch vault_channel, p_cur currency_code, p_start bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vid uuid;
BEGIN
  SELECT id INTO vid FROM public.accounts
    WHERE kind='vault' AND vault_channel=p_ch AND name=p_name LIMIT 1;
  IF vid IS NULL THEN
    INSERT INTO public.accounts(name, kind, nature, vault_channel)
      VALUES (p_name, 'vault', 'debit', p_ch) RETURNING id INTO vid;
  END IF;
  INSERT INTO public.account_balances(account_id, currency, balance_minor, debit_limit_minor)
    VALUES (vid, p_cur, p_start, 0)
    ON CONFLICT (account_id, currency) DO NOTHING;
  RETURN vid;
END $$;

CREATE OR REPLACE FUNCTION public._upsert_customer(p_name text, p_owner uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM public.accounts WHERE kind='customer' AND name=p_name LIMIT 1;
  IF cid IS NULL THEN
    INSERT INTO public.accounts(name, kind, nature, owner_user_id)
      VALUES (p_name, 'customer', 'credit', p_owner) RETURNING id INTO cid;
  END IF;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.seed_demo_ledger(
  p_admin_id uuid, p_teller_id uuid, p_consumer_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cash_usd uuid; v_cash_eur uuid; v_cash_lyd uuid;
  v_bank_usd uuid; v_bank_eur uuid; v_bank_lyd uuid;
  v_wire_usd uuid;
  v_layla uuid; v_omar uuid; v_sara uuid; v_mohamed uuid; v_fatima uuid;
  v_tx_count int := 0; v_pending_count int := 0;
BEGIN
  v_cash_usd := public._upsert_vault('Cash Vault', 'cash', 'USD', 10000000);
  v_cash_eur := public._upsert_vault('Cash Vault', 'cash', 'EUR', 10000000);
  v_cash_lyd := public._upsert_vault('Cash Vault', 'cash', 'LYD', 50000000);
  v_bank_usd := public._upsert_vault('Bank Vault', 'bank', 'USD', 10000000);
  v_bank_eur := public._upsert_vault('Bank Vault', 'bank', 'EUR', 10000000);
  v_bank_lyd := public._upsert_vault('Bank Vault', 'bank', 'LYD', 50000000);
  v_wire_usd := public._upsert_vault('Wire Vault', 'wire', 'USD', 10000000);

  v_layla   := public._upsert_customer('Layla Hassan', p_consumer_id);
  v_omar    := public._upsert_customer('Omar Khalifa', NULL);
  v_sara    := public._upsert_customer('Sara Ahmed', NULL);
  v_mohamed := public._upsert_customer('Mohamed Ali', NULL);
  v_fatima  := public._upsert_customer('Fatima Saleh', NULL);

  INSERT INTO public.account_balances(account_id, currency, balance_minor, debit_limit_minor) VALUES
    (v_layla, 'USD', 0, 0), (v_layla, 'LYD', 0, 0),
    (v_omar, 'LYD', 0, 0),
    (v_sara, 'USD', 0, 0), (v_sara, 'EUR', 0, 0),
    (v_mohamed, 'USD', 0, 50000),
    (v_fatima, 'EUR', 0, 0)
  ON CONFLICT (account_id, currency) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.transactions LIMIT 1) THEN
    PERFORM public._seed_post_tx(p_teller_id, v_layla, v_cash_usd, 'USD', 'deposit', 'cash', 250000, 'Initial cash deposit');
    PERFORM public._seed_post_tx(p_teller_id, v_layla, v_cash_lyd, 'LYD', 'deposit', 'cash', 1500000, 'Salary deposit');
    PERFORM public._seed_post_tx(p_teller_id, v_omar, v_cash_lyd, 'LYD', 'deposit', 'cash', 800000, 'Cash deposit');
    PERFORM public._seed_post_tx(p_teller_id, v_sara, v_bank_usd, 'USD', 'deposit', 'bank', 500000, 'Wire transfer received');
    PERFORM public._seed_post_tx(p_teller_id, v_sara, v_bank_eur, 'EUR', 'deposit', 'bank', 300000, 'EUR transfer received');
    PERFORM public._seed_post_tx(p_teller_id, v_mohamed, v_cash_usd, 'USD', 'deposit', 'cash', 120000, 'Opening deposit');
    PERFORM public._seed_post_tx(p_teller_id, v_fatima, v_bank_eur, 'EUR', 'deposit', 'bank', 200000, 'Initial deposit');
    PERFORM public._seed_post_tx(p_teller_id, v_layla, v_cash_usd, 'USD', 'withdraw', 'cash', 50000, 'Cash withdrawal at counter');
    PERFORM public._seed_post_tx(p_teller_id, v_omar, v_cash_lyd, 'LYD', 'withdraw', 'cash', 200000, 'Cash withdrawal');
    PERFORM public._seed_post_tx(p_teller_id, v_sara, v_bank_usd, 'USD', 'withdraw', 'bank', 100000, 'Bank transfer out');
    PERFORM public._seed_post_tx(p_teller_id, v_sara, v_bank_usd, 'USD', 'deposit', 'bank', 750000, 'Large incoming wire');
    PERFORM public._seed_post_tx(p_teller_id, v_layla, v_cash_lyd, 'LYD', 'deposit', 'cash', 3000000, 'Large LYD deposit');
    PERFORM public._seed_pending_tx(p_teller_id, v_fatima, v_bank_eur, 'EUR', 'withdraw', 'bank', 500000, 'Customer requested large withdrawal');
    PERFORM public._seed_pending_tx(p_teller_id, v_mohamed, v_cash_usd, 'USD', 'withdraw', 'cash', 200000, 'Withdrawal exceeding limit');
    v_tx_count := 12; v_pending_count := 2;
  END IF;

  INSERT INTO public.notification_preferences(user_id) VALUES (p_admin_id), (p_teller_id)
    ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('vaults', 7, 'customers', 5,
    'transactions_seeded', v_tx_count, 'pending_seeded', v_pending_count);
END $$;