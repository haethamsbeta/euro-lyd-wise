
-- =========================================================
-- IDEMPOTENT REBUILD MIGRATION
-- Safe to run on existing database. No data loss.
-- =========================================================

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','teller','auditor','consumer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.account_kind AS ENUM ('customer','vault');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.account_nature AS ENUM ('debit','credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.entry_side AS ENUM ('debit','credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tx_status AS ENUM ('pending','posted','rejected','reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tx_direction AS ENUM ('deposit','withdraw');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vault_channel AS ENUM ('cash','bank','wire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.currency_code AS ENUM ('USD','EUR','LYD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_event AS ENUM (
    'tx_posted','pending_created','approval_decision','large_tx','low_vault',
    'overdraft','daily_summary','account_change','reminder_pending','reminder_shift'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_severity AS ENUM ('info','warning','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- SEQUENCES ----------
CREATE SEQUENCE IF NOT EXISTS public.tx_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.customer_account_seq START 100000;
CREATE SEQUENCE IF NOT EXISTS public.dahab_holder_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.account_holders_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.holder_accounts_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.holder_ledger_entries_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.account_import_batches_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.account_import_staging_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.account_link_review_queue_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.account_name_aliases_id_seq;

-- ---------- CORE TABLES (only create-if-missing; existing tables untouched) ----------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS public.currencies (
  currency_code varchar PRIMARY KEY,
  currency_name text NOT NULL,
  symbol text
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind public.account_kind NOT NULL,
  nature public.account_nature NOT NULL,
  vault_channel public.vault_channel,
  account_number text,
  owner_user_id uuid,
  phone text,
  national_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_balances (
  account_id uuid NOT NULL,
  currency public.currency_code NOT NULL,
  balance_minor bigint NOT NULL DEFAULT 0,
  debit_limit_minor bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, currency)
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_number text NOT NULL UNIQUE,
  customer_account_id uuid NOT NULL,
  vault_account_id uuid,
  currency public.currency_code NOT NULL,
  direction public.tx_direction NOT NULL,
  channel public.vault_channel NOT NULL,
  amount_minor bigint NOT NULL,
  status public.tx_status NOT NULL,
  comment text NOT NULL,
  reject_reason text,
  correction_reason text,
  reverses_tx_id uuid,
  corrected_by_tx_id uuid,
  created_by_user_id uuid NOT NULL,
  approved_by_user_id uuid,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  account_id uuid NOT NULL,
  side public.entry_side NOT NULL,
  amount_minor bigint NOT NULL,
  currency public.currency_code NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  target text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type public.notification_event NOT NULL,
  severity public.notification_severity NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  transaction_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY,
  enabled jsonb NOT NULL DEFAULT jsonb_build_object(
    'tx_posted',true,'pending_created',true,'approval_decision',true,
    'large_tx',true,'low_vault',true,'overdraft',true,'daily_summary',true,
    'account_change',true,'reminder_pending',true,'reminder_shift',true),
  large_tx_threshold jsonb NOT NULL DEFAULT jsonb_build_object('USD',500000,'EUR',500000,'LYD',2500000),
  low_vault_threshold jsonb NOT NULL DEFAULT jsonb_build_object('USD',100000,'EUR',100000,'LYD',500000),
  daily_summary_enabled boolean NOT NULL DEFAULT true,
  daily_summary_time time NOT NULL DEFAULT '17:00',
  pending_reminder_minutes int NOT NULL DEFAULT 30,
  quiet_hours_start time,
  quiet_hours_end time,
  browser_push_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_reminders_state (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text,
  user_agent text,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transaction_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid,
  uploaded_by uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_label text NOT NULL DEFAULT 'This device',
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL,
  purpose text NOT NULL,
  user_id uuid,
  email text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Holder/import tables
CREATE TABLE IF NOT EXISTS public.account_holders (
  id bigint PRIMARY KEY DEFAULT nextval('public.account_holders_id_seq'),
  dahab_account_number varchar NOT NULL UNIQUE,
  canonical_name text NOT NULL,
  normalized_name text NOT NULL,
  holder_type varchar NOT NULL DEFAULT 'INDIVIDUAL',
  status varchar NOT NULL DEFAULT 'ACTIVE',
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.holder_accounts (
  id bigint PRIMARY KEY DEFAULT nextval('public.holder_accounts_id_seq'),
  account_number varchar NOT NULL UNIQUE,
  account_holder_id bigint NOT NULL,
  dahab_account_number varchar,
  currency_code varchar NOT NULL,
  account_nature varchar NOT NULL,
  account_display_name text NOT NULL,
  account_alias_name text,
  is_primary_account boolean NOT NULL DEFAULT false,
  status varchar NOT NULL DEFAULT 'ACTIVE',
  current_balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.holder_ledger_entries (
  id bigint PRIMARY KEY DEFAULT nextval('public.holder_ledger_entries_id_seq'),
  account_id bigint NOT NULL,
  tx_number varchar NOT NULL,
  currency_code varchar NOT NULL,
  debit_amount numeric NOT NULL DEFAULT 0,
  credit_amount numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL,
  description text,
  posted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_import_batches (
  id bigint PRIMARY KEY DEFAULT nextval('public.account_import_batches_id_seq'),
  file_name text NOT NULL,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  status varchar NOT NULL DEFAULT 'PENDING',
  total_rows int NOT NULL DEFAULT 0,
  successful_rows int NOT NULL DEFAULT 0,
  failed_rows int NOT NULL DEFAULT 0,
  review_rows int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.account_import_staging (
  id bigint PRIMARY KEY DEFAULT nextval('public.account_import_staging_id_seq'),
  import_batch_id bigint,
  source_row_number int,
  raw_name text,
  source_account_number varchar,
  dahab_account_number varchar,
  extracted_currency_code varchar,
  nature varchar,
  base_name_candidate text,
  normalized_name_candidate text,
  canonical_name_candidate text,
  account_alias_name text,
  is_primary_account boolean DEFAULT false,
  suggested_account_holder_id bigint,
  suggested_dahab_account_number varchar,
  confidence_score numeric,
  review_status varchar NOT NULL DEFAULT 'PENDING',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_link_review_queue (
  id bigint PRIMARY KEY DEFAULT nextval('public.account_link_review_queue_id_seq'),
  staging_id bigint,
  import_batch_id bigint,
  raw_name text,
  source_account_number varchar,
  base_name_candidate text,
  normalized_name_candidate text,
  extracted_currency_code varchar,
  suggested_account_holder_id bigint,
  confidence_score numeric,
  review_status varchar NOT NULL DEFAULT 'PENDING',
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_name_aliases (
  id bigint PRIMARY KEY DEFAULT nextval('public.account_name_aliases_id_seq'),
  account_id bigint NOT NULL,
  alias_name text NOT NULL,
  alias_type varchar NOT NULL DEFAULT 'ALTERNATIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- ENABLE RLS (idempotent) ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reminders_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_holders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holder_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holder_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_import_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_link_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_name_aliases ENABLE ROW LEVEL SECURITY;

-- ---------- CORE FUNCTIONS (CREATE OR REPLACE — already in DB; re-run as no-op safety) ----------
-- has_role, is_staff, handle_new_user already exist per schema dump; keep idempotent.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','teller','auditor'));
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

-- handle_new_user trigger on auth.users
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ---------- STORAGE BUCKET ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('tx-attachments','tx-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop-then-create for idempotency)
DROP POLICY IF EXISTS "tx-attachments staff read" ON storage.objects;
CREATE POLICY "tx-attachments staff read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'tx-attachments' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "tx-attachments owner upload" ON storage.objects;
CREATE POLICY "tx-attachments owner upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tx-attachments' AND public.is_staff(auth.uid()) AND owner = auth.uid());

DROP POLICY IF EXISTS "tx-attachments staff update" ON storage.objects;
CREATE POLICY "tx-attachments staff update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'tx-attachments' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "tx-attachments staff delete" ON storage.objects;
CREATE POLICY "tx-attachments staff delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tx-attachments' AND public.is_staff(auth.uid()));

-- ---------- SEED CURRENCIES ----------
INSERT INTO public.currencies(currency_code, currency_name, symbol) VALUES
  ('USD','US Dollar','$'),
  ('EUR','Euro','€'),
  ('LYD','Libyan Dinar','ل.د')
ON CONFLICT (currency_code) DO NOTHING;
