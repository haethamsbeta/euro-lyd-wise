
-- Sequence for DAHAB numbers
CREATE SEQUENCE IF NOT EXISTS public.dahab_holder_seq START 1;

CREATE OR REPLACE FUNCTION public.next_dahab_account_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'DAHAB-' || lpad(nextval('public.dahab_holder_seq')::text, 6, '0');
$$;

-- Currencies
CREATE TABLE public.currencies (
  currency_code varchar(8) PRIMARY KEY,
  currency_name text NOT NULL,
  symbol text
);
INSERT INTO public.currencies(currency_code, currency_name, symbol) VALUES
  ('LYD','Libyan Dinar','د.ل'),
  ('USD','US Dollar','$'),
  ('EUR','Euro','€'),
  ('GBP','British Pound','£'),
  ('UNK','Unknown','?');

-- Account holders
CREATE TABLE public.account_holders (
  id bigserial PRIMARY KEY,
  dahab_account_number varchar(30) NOT NULL UNIQUE,
  canonical_name text NOT NULL,
  normalized_name text NOT NULL,
  holder_type varchar(20) NOT NULL DEFAULT 'INDIVIDUAL',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_account_holders_normalized_name ON public.account_holders(normalized_name);

-- Holder accounts
CREATE TABLE public.holder_accounts (
  id bigserial PRIMARY KEY,
  account_number varchar(50) NOT NULL UNIQUE,
  account_holder_id bigint NOT NULL REFERENCES public.account_holders(id) ON DELETE CASCADE,
  currency_code varchar(8) NOT NULL REFERENCES public.currencies(currency_code),
  account_nature varchar(10) NOT NULL,
  account_display_name text NOT NULL,
  account_alias_name text,
  is_primary_account boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  current_balance numeric(19,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_holder_accounts_holder_id ON public.holder_accounts(account_holder_id);
CREATE INDEX idx_holder_accounts_holder_currency ON public.holder_accounts(account_holder_id, currency_code);

-- Aliases
CREATE TABLE public.account_name_aliases (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES public.holder_accounts(id) ON DELETE CASCADE,
  alias_name text NOT NULL,
  alias_type varchar(30) NOT NULL DEFAULT 'ALTERNATIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_account_name_aliases_account ON public.account_name_aliases(account_id);

-- Ledger entries (per holder account)
CREATE TABLE public.holder_ledger_entries (
  id bigserial PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES public.holder_accounts(id) ON DELETE CASCADE,
  tx_number varchar(50) NOT NULL UNIQUE,
  posted_at timestamptz NOT NULL,
  description text,
  debit_amount numeric(19,4) NOT NULL DEFAULT 0,
  credit_amount numeric(19,4) NOT NULL DEFAULT 0,
  balance_after numeric(19,4) NOT NULL,
  currency_code varchar(8) NOT NULL REFERENCES public.currencies(currency_code),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_holder_ledger_account_date ON public.holder_ledger_entries(account_id, posted_at, id);
CREATE INDEX idx_holder_ledger_tx_number ON public.holder_ledger_entries(tx_number);

-- Import batches
CREATE TABLE public.account_import_batches (
  id bigserial PRIMARY KEY,
  file_name text NOT NULL,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  total_rows integer NOT NULL DEFAULT 0,
  successful_rows integer NOT NULL DEFAULT 0,
  review_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL DEFAULT 'PENDING'
);

-- Staging
CREATE TABLE public.account_import_staging (
  id bigserial PRIMARY KEY,
  import_batch_id bigint REFERENCES public.account_import_batches(id) ON DELETE CASCADE,
  source_row_number integer,
  source_account_number varchar(50),
  nature varchar(20),
  raw_name text,
  extracted_currency_code varchar(8),
  base_name_candidate text,
  normalized_name_candidate text,
  suggested_dahab_account_number varchar(30),
  suggested_account_holder_id bigint,
  confidence_score numeric(5,2),
  review_status varchar(30) NOT NULL DEFAULT 'PENDING',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_staging_batch ON public.account_import_staging(import_batch_id);

-- Review queue
CREATE TABLE public.account_link_review_queue (
  id bigserial PRIMARY KEY,
  import_batch_id bigint REFERENCES public.account_import_batches(id) ON DELETE CASCADE,
  staging_id bigint REFERENCES public.account_import_staging(id) ON DELETE CASCADE,
  source_account_number varchar(50),
  raw_name text,
  extracted_currency_code varchar(8),
  base_name_candidate text,
  normalized_name_candidate text,
  suggested_account_holder_id bigint,
  confidence_score numeric(5,2),
  review_status varchar(30) NOT NULL DEFAULT 'PENDING',
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_queue_status ON public.account_link_review_queue(review_status);

-- RLS
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_holders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holder_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_name_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holder_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_import_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_link_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "currencies read" ON public.currencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "currencies admin write" ON public.currencies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "holders read" ON public.account_holders FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR owner_user_id = auth.uid());
CREATE POLICY "holders admin write" ON public.account_holders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "holder_accounts read" ON public.holder_accounts FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.account_holders h WHERE h.id = holder_accounts.account_holder_id AND h.owner_user_id = auth.uid()
  ));
CREATE POLICY "holder_accounts admin write" ON public.holder_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "aliases read" ON public.account_name_aliases FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "aliases admin write" ON public.account_name_aliases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "holder_ledger read" ON public.holder_ledger_entries FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.holder_accounts a JOIN public.account_holders h ON h.id = a.account_holder_id
    WHERE a.id = holder_ledger_entries.account_id AND h.owner_user_id = auth.uid()
  ));
CREATE POLICY "holder_ledger admin write" ON public.holder_ledger_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "import_batches staff read" ON public.account_import_batches FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "import_batches admin write" ON public.account_import_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "import_staging staff read" ON public.account_import_staging FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "import_staging admin write" ON public.account_import_staging FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "review_queue staff read" ON public.account_link_review_queue FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "review_queue admin write" ON public.account_link_review_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Approve import RPC: groups staging rows into holders + holder_accounts
CREATE OR REPLACE FUNCTION public.approve_import_batch(p_batch_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  r RECORD;
  v_holder_id bigint;
  v_dahab text;
  v_created_holders int := 0;
  v_linked_accounts int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  FOR r IN
    SELECT * FROM public.account_import_staging
    WHERE import_batch_id = p_batch_id
      AND review_status = 'PENDING'
      AND extracted_currency_code IS NOT NULL
      AND extracted_currency_code <> 'UNK'
      AND source_account_number IS NOT NULL
      AND raw_name IS NOT NULL
      AND normalized_name_candidate IS NOT NULL
    ORDER BY id
  LOOP
    -- Skip duplicates already imported
    IF EXISTS (SELECT 1 FROM public.holder_accounts WHERE account_number = r.source_account_number) THEN
      UPDATE public.account_import_staging SET review_status='SKIPPED', error_message='Duplicate account_number' WHERE id = r.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id INTO v_holder_id FROM public.account_holders WHERE normalized_name = r.normalized_name_candidate LIMIT 1;
    IF v_holder_id IS NULL THEN
      v_dahab := public.next_dahab_account_number();
      INSERT INTO public.account_holders(dahab_account_number, canonical_name, normalized_name)
        VALUES (v_dahab, COALESCE(r.base_name_candidate, r.raw_name), r.normalized_name_candidate)
        RETURNING id INTO v_holder_id;
      v_created_holders := v_created_holders + 1;
    END IF;

    INSERT INTO public.holder_accounts(account_number, account_holder_id, currency_code, account_nature, account_display_name, account_alias_name)
      VALUES (r.source_account_number, v_holder_id, r.extracted_currency_code, COALESCE(r.nature,'Debit'), r.raw_name, r.extracted_currency_code || ' Account');
    v_linked_accounts := v_linked_accounts + 1;

    UPDATE public.account_import_staging SET review_status='IMPORTED', suggested_account_holder_id = v_holder_id WHERE id = r.id;
  END LOOP;

  UPDATE public.account_import_batches
    SET status='APPROVED', successful_rows = v_linked_accounts
    WHERE id = p_batch_id;

  RETURN jsonb_build_object('created_holders', v_created_holders, 'linked_accounts', v_linked_accounts, 'skipped', v_skipped);
END;
$$;
