
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'teller', 'auditor', 'consumer');
CREATE TYPE public.account_kind AS ENUM ('customer', 'vault');
CREATE TYPE public.account_nature AS ENUM ('credit', 'debit');
CREATE TYPE public.vault_channel AS ENUM ('cash', 'bank');
CREATE TYPE public.currency_code AS ENUM ('USD', 'EUR', 'LYD');
CREATE TYPE public.tx_direction AS ENUM ('deposit', 'withdraw');
CREATE TYPE public.tx_status AS ENUM ('posted', 'pending', 'rejected');
CREATE TYPE public.entry_side AS ENUM ('debit', 'credit');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','teller','auditor')
  );
$$;

-- ============ ACCOUNTS ============
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number TEXT UNIQUE,
  kind public.account_kind NOT NULL,
  nature public.account_nature NOT NULL,
  vault_channel public.vault_channel,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  national_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vault_must_have_channel CHECK (
    (kind = 'vault' AND vault_channel IS NOT NULL AND nature = 'debit')
    OR (kind = 'customer' AND vault_channel IS NULL)
  )
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Auto account number for customers
CREATE SEQUENCE public.customer_account_seq START 10000;
CREATE OR REPLACE FUNCTION public.set_account_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_number IS NULL AND NEW.kind = 'customer' THEN
    NEW.account_number := nextval('public.customer_account_seq')::text;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_set_account_number BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_account_number();

-- ============ ACCOUNT BALANCES ============
CREATE TABLE public.account_balances (
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  currency public.currency_code NOT NULL,
  balance_minor BIGINT NOT NULL DEFAULT 0,
  debit_limit_minor BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, currency)
);
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;

-- ============ TRANSACTIONS ============
CREATE SEQUENCE public.tx_number_seq START 1;
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_number TEXT NOT NULL UNIQUE,
  customer_account_id UUID NOT NULL REFERENCES public.accounts(id),
  vault_account_id UUID REFERENCES public.accounts(id),
  currency public.currency_code NOT NULL,
  direction public.tx_direction NOT NULL,
  channel public.vault_channel NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  comment TEXT NOT NULL,
  status public.tx_status NOT NULL,
  reject_reason TEXT,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  approved_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ,
  CONSTRAINT comment_not_blank CHECK (length(btrim(comment)) >= 3)
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tx_customer ON public.transactions(customer_account_id);
CREATE INDEX idx_tx_created_by ON public.transactions(created_by_user_id);
CREATE INDEX idx_tx_status ON public.transactions(status);

-- ============ LEDGER ENTRIES ============
CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  side public.entry_side NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency public.currency_code NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_le_account ON public.ledger_entries(account_id);
CREATE INDEX idx_le_tx ON public.ledger_entries(transaction_id);

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============
-- profiles
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- user_roles: users see own; admins see/manage all
CREATE POLICY "roles read self or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles admin manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- accounts
CREATE POLICY "accounts staff read all" ON public.accounts FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR owner_user_id = auth.uid());
CREATE POLICY "accounts admin insert" ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "accounts admin update" ON public.accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND kind = 'customer');

-- account_balances
CREATE POLICY "balances read" ON public.account_balances FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.owner_user_id = auth.uid())
  );
CREATE POLICY "balances admin update limits" ON public.account_balances FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "balances admin insert" ON public.account_balances FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- transactions
CREATE POLICY "tx read" ON public.transactions FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = customer_account_id AND a.owner_user_id = auth.uid())
  );

-- ledger_entries
CREATE POLICY "le read" ON public.ledger_entries FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.owner_user_id = auth.uid())
  );

-- audit_log
CREATE POLICY "audit staff read" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'auditor'));

-- ============ POSTING FUNCTION ============
CREATE OR REPLACE FUNCTION public.post_transaction(
  p_customer_account_id UUID,
  p_currency public.currency_code,
  p_direction public.tx_direction,
  p_channel public.vault_channel,
  p_amount_minor BIGINT,
  p_comment TEXT
)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_vault public.accounts;
  v_customer public.accounts;
  v_cust_bal public.account_balances;
  v_vault_bal public.account_balances;
  v_status public.tx_status;
  v_tx public.transactions;
  v_tx_num TEXT;
  v_customer_side public.entry_side;
  v_vault_side public.entry_side;
  v_cust_delta BIGINT;
  v_vault_delta BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'teller') OR public.has_role(v_uid,'admin')) THEN
    RAISE EXCEPTION 'Only tellers or admins can post transactions';
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF p_comment IS NULL OR length(btrim(p_comment)) < 3 THEN
    RAISE EXCEPTION 'A comment of at least 3 characters is required';
  END IF;

  SELECT * INTO v_customer FROM public.accounts WHERE id = p_customer_account_id AND kind='customer';
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer account not found'; END IF;

  SELECT * INTO v_vault FROM public.accounts
   WHERE kind='vault' AND vault_channel = p_channel
   LIMIT 1;
  -- pick the right currency vault
  SELECT a.* INTO v_vault FROM public.accounts a
   JOIN public.account_balances b ON b.account_id = a.id
   WHERE a.kind='vault' AND a.vault_channel = p_channel AND b.currency = p_currency
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vault for % %/% not found', p_channel, p_currency, p_currency; END IF;

  -- lock balances
  SELECT * INTO v_cust_bal FROM public.account_balances
   WHERE account_id = v_customer.id AND currency = p_currency FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.account_balances(account_id, currency, balance_minor, debit_limit_minor)
    VALUES (v_customer.id, p_currency, 0, 0)
    RETURNING * INTO v_cust_bal;
  END IF;
  SELECT * INTO v_vault_bal FROM public.account_balances
   WHERE account_id = v_vault.id AND currency = p_currency FOR UPDATE;

  -- direction => sides
  IF p_direction = 'deposit' THEN
    v_customer_side := 'credit'; v_vault_side := 'debit';
  ELSE
    v_customer_side := 'debit'; v_vault_side := 'credit';
  END IF;

  -- compute deltas using nature labels
  v_cust_delta := CASE WHEN v_customer.nature::text = v_customer_side::text THEN p_amount_minor ELSE -p_amount_minor END;
  v_vault_delta := CASE WHEN v_vault.nature::text = v_vault_side::text THEN p_amount_minor ELSE -p_amount_minor END;

  v_status := 'posted';
  IF p_direction = 'withdraw' THEN
    IF v_cust_bal.balance_minor + v_cust_delta < 0 THEN
      v_status := 'pending';
    ELSIF v_cust_bal.debit_limit_minor > 0 AND p_amount_minor > v_cust_bal.debit_limit_minor THEN
      v_status := 'pending';
    END IF;
  END IF;

  v_tx_num := 'TX-' || lpad(nextval('public.tx_number_seq')::text, 6, '0');

  INSERT INTO public.transactions(
    tx_number, customer_account_id, vault_account_id, currency, direction,
    channel, amount_minor, comment, status, created_by_user_id, posted_at
  ) VALUES (
    v_tx_num, v_customer.id, v_vault.id, p_currency, p_direction,
    p_channel, p_amount_minor, btrim(p_comment), v_status, v_uid,
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
          jsonb_build_object('direction', p_direction, 'channel', p_channel, 'currency', p_currency, 'amount_minor', p_amount_minor));

  RETURN v_tx;
END; $$;

-- approve pending withdrawal
CREATE OR REPLACE FUNCTION public.approve_transaction(p_tx_id UUID)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tx public.transactions;
  v_customer public.accounts;
  v_vault public.accounts;
  v_customer_side public.entry_side;
  v_vault_side public.entry_side;
  v_cust_delta BIGINT;
  v_vault_delta BIGINT;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND OR v_tx.status <> 'pending' THEN RAISE EXCEPTION 'Not pending'; END IF;

  SELECT * INTO v_customer FROM public.accounts WHERE id = v_tx.customer_account_id;
  SELECT * INTO v_vault FROM public.accounts WHERE id = v_tx.vault_account_id;

  IF v_tx.direction = 'deposit' THEN
    v_customer_side := 'credit'; v_vault_side := 'debit';
  ELSE
    v_customer_side := 'debit'; v_vault_side := 'credit';
  END IF;

  v_cust_delta := CASE WHEN v_customer.nature::text = v_customer_side::text THEN v_tx.amount_minor ELSE -v_tx.amount_minor END;
  v_vault_delta := CASE WHEN v_vault.nature::text = v_vault_side::text THEN v_tx.amount_minor ELSE -v_tx.amount_minor END;

  INSERT INTO public.ledger_entries(transaction_id, account_id, side, amount_minor, currency)
  VALUES (v_tx.id, v_customer.id, v_customer_side, v_tx.amount_minor, v_tx.currency),
         (v_tx.id, v_vault.id, v_vault_side, v_tx.amount_minor, v_tx.currency);

  UPDATE public.account_balances SET balance_minor = balance_minor + v_cust_delta
    WHERE account_id = v_customer.id AND currency = v_tx.currency;
  UPDATE public.account_balances SET balance_minor = balance_minor + v_vault_delta
    WHERE account_id = v_vault.id AND currency = v_tx.currency;

  UPDATE public.transactions
    SET status='posted', approved_by_user_id = v_uid, posted_at = now()
    WHERE id = v_tx.id RETURNING * INTO v_tx;

  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (v_uid, 'tx.approve', v_tx.tx_number, jsonb_build_object('amount_minor', v_tx.amount_minor));
  RETURN v_tx;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_transaction(p_tx_id UUID, p_reason TEXT)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_tx public.transactions;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.transactions
    SET status='rejected', approved_by_user_id = v_uid, reject_reason = p_reason
    WHERE id = p_tx_id AND status = 'pending'
    RETURNING * INTO v_tx;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not pending'; END IF;
  INSERT INTO public.audit_log(actor_user_id, action, target, details)
  VALUES (v_uid, 'tx.reject', v_tx.tx_number, jsonb_build_object('reason', p_reason));
  RETURN v_tx;
END; $$;

-- ============ SEED VAULTS ============
INSERT INTO public.accounts (kind, nature, vault_channel, name, account_number) VALUES
  ('vault','debit','cash','Cash Vault','VAULT-CASH'),
  ('vault','debit','bank','Bank Vault','VAULT-BANK');

INSERT INTO public.account_balances (account_id, currency, balance_minor)
SELECT a.id, c.currency::public.currency_code, 0
FROM public.accounts a
CROSS JOIN (VALUES ('USD'),('EUR'),('LYD')) AS c(currency)
WHERE a.kind = 'vault';
