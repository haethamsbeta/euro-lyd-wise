-- DAHAB — AWS RDS PostgreSQL schema (idempotent-ish; intended for fresh DB).
-- Mirrors the Lovable Cloud schema 1:1. Keep in sync when migrations land.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

------------------------------------------------------------------------------
-- Enums
------------------------------------------------------------------------------
CREATE TYPE app_role             AS ENUM ('admin','teller','auditor','consumer');
CREATE TYPE currency_code        AS ENUM ('USD','EUR','LYD');
CREATE TYPE account_kind         AS ENUM ('customer','vault');
CREATE TYPE account_nature       AS ENUM ('credit','debit');
CREATE TYPE vault_channel        AS ENUM ('cash','bank');
CREATE TYPE entry_side           AS ENUM ('debit','credit');
CREATE TYPE tx_direction         AS ENUM ('deposit','withdraw');
CREATE TYPE tx_status            AS ENUM ('posted','pending','rejected','reversed');
CREATE TYPE notification_severity AS ENUM ('info','warning','critical');
CREATE TYPE notification_event   AS ENUM (
  'tx_posted','pending_created','approval_decision','large_tx','low_vault',
  'overdraft','daily_summary','account_change','reminder_pending','reminder_shift'
);

------------------------------------------------------------------------------
-- Auth surrogate (when not using Supabase auth schema; AWS Cognito = JWT.sub)
------------------------------------------------------------------------------
-- The API layer is responsible for JWT verification and for setting
-- app.current_user_id GUC each request (see 05_permissions.sql).
-- We do NOT replicate auth.users; identity is whatever JWT.sub resolves to.

------------------------------------------------------------------------------
-- Profiles & roles
------------------------------------------------------------------------------
CREATE TABLE branches (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  city        TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id                    UUID PRIMARY KEY,
  full_name             TEXT NOT NULL DEFAULT '',
  branch_id             BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  must_change_password  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  role       app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);

CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role)
$$;

CREATE OR REPLACE FUNCTION is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles
                 WHERE user_id=_user_id AND role IN ('admin','teller','auditor'))
$$;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true),'')::uuid
$$;

------------------------------------------------------------------------------
-- Currencies (lookup, optional)
------------------------------------------------------------------------------
CREATE TABLE currencies (
  currency_code VARCHAR(3) PRIMARY KEY,
  currency_name TEXT NOT NULL,
  symbol        TEXT
);
INSERT INTO currencies VALUES
  ('USD','US Dollar','$'),('EUR','Euro','€'),('LYD','Libyan Dinar','LD')
ON CONFLICT DO NOTHING;

------------------------------------------------------------------------------
-- Account holders (legacy bigint side)
------------------------------------------------------------------------------
CREATE TABLE account_holders (
  id                    BIGSERIAL PRIMARY KEY,
  dahab_account_number  VARCHAR(32) NOT NULL UNIQUE,
  canonical_name        TEXT NOT NULL,
  normalized_name       TEXT NOT NULL,
  holder_type           VARCHAR(16) NOT NULL DEFAULT 'INDIVIDUAL'
                          CHECK (holder_type IN ('INDIVIDUAL','BUSINESS','TRUST')),
  status                VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  owner_user_id         UUID,
  phone                 TEXT,
  email                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_holders_norm ON account_holders(normalized_name);
CREATE INDEX idx_holders_owner ON account_holders(owner_user_id);

CREATE TABLE holder_accounts (
  id                      BIGSERIAL PRIMARY KEY,
  account_holder_id       BIGINT NOT NULL REFERENCES account_holders(id) ON DELETE CASCADE,
  account_number          VARCHAR(32) NOT NULL,
  account_display_name    TEXT NOT NULL,
  account_alias_name      TEXT,
  currency_code           VARCHAR(3) NOT NULL REFERENCES currencies(currency_code),
  account_nature          VARCHAR(8) NOT NULL CHECK (account_nature IN ('Debit','Credit')),
  status                  VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  current_balance         NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit_limit            NUMERIC(20,2) NOT NULL DEFAULT 0,
  debit_limit             NUMERIC(20,2) NOT NULL DEFAULT 0,
  withdraw_limit_amount   NUMERIC(20,2) NOT NULL DEFAULT 0,
  withdraw_limit_enabled  BOOLEAN NOT NULL DEFAULT false,
  is_primary_account      BOOLEAN NOT NULL DEFAULT false,
  dahab_account_number    VARCHAR(32),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_holder_id, account_number)
);
CREATE INDEX idx_holder_accounts_holder ON holder_accounts(account_holder_id);
CREATE INDEX idx_holder_accounts_dahab ON holder_accounts(dahab_account_number);

CREATE TABLE account_name_aliases (
  id          BIGSERIAL PRIMARY KEY,
  account_id  BIGINT NOT NULL REFERENCES holder_accounts(id) ON DELETE CASCADE,
  alias_name  TEXT NOT NULL,
  alias_type  VARCHAR(16) NOT NULL DEFAULT 'ALTERNATIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE holder_account_limit_events (
  id                  BIGSERIAL PRIMARY KEY,
  holder_account_id   BIGINT NOT NULL REFERENCES holder_accounts(id) ON DELETE CASCADE,
  prev_amount         NUMERIC(20,2) NOT NULL,
  new_amount          NUMERIC(20,2) NOT NULL,
  prev_enabled        BOOLEAN NOT NULL,
  new_enabled         BOOLEAN NOT NULL,
  note                TEXT,
  actor_user_id       UUID,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE holder_ledger_entries (
  id              BIGSERIAL PRIMARY KEY,
  account_id      BIGINT NOT NULL REFERENCES holder_accounts(id) ON DELETE CASCADE,
  tx_number       VARCHAR(32) NOT NULL,
  posted_at       TIMESTAMPTZ NOT NULL,
  description     TEXT,
  debit_amount    NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit_amount   NUMERIC(20,2) NOT NULL DEFAULT 0,
  balance_after   NUMERIC(20,2) NOT NULL,
  currency_code   VARCHAR(3) NOT NULL REFERENCES currencies(currency_code),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_holder_ledger_account ON holder_ledger_entries(account_id, posted_at DESC);

------------------------------------------------------------------------------
-- Modern double-entry side (uuid)
------------------------------------------------------------------------------
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  account_number  TEXT,
  kind            account_kind NOT NULL,
  nature          account_nature NOT NULL,
  vault_channel   vault_channel,
  owner_user_id   UUID,
  status          TEXT NOT NULL DEFAULT 'active',
  phone           TEXT,
  national_id     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind <> 'vault' OR vault_channel IS NOT NULL)
);
CREATE INDEX idx_accounts_owner ON accounts(owner_user_id);
CREATE INDEX idx_accounts_kind ON accounts(kind);

CREATE TABLE account_balances (
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  currency          currency_code NOT NULL,
  balance_minor     BIGINT NOT NULL DEFAULT 0,
  debit_limit_minor BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, currency)
);

CREATE TABLE transactions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_number                TEXT NOT NULL UNIQUE,
  customer_account_id      UUID NOT NULL REFERENCES accounts(id),
  vault_account_id         UUID REFERENCES accounts(id),
  direction                tx_direction NOT NULL,
  channel                  vault_channel NOT NULL,
  currency                 currency_code NOT NULL,
  amount_minor             BIGINT NOT NULL CHECK (amount_minor > 0),
  requested_amount_minor   BIGINT,
  status                   tx_status NOT NULL,
  comment                  TEXT NOT NULL DEFAULT '',
  review_reason            TEXT,
  reject_reason            TEXT,
  correction_reason        TEXT,
  reverses_tx_id           UUID REFERENCES transactions(id),
  corrected_by_tx_id       UUID REFERENCES transactions(id),
  created_by_user_id       UUID NOT NULL,
  approved_by_user_id      UUID,
  branch_id                BIGINT REFERENCES branches(id),
  partial_approved         BOOLEAN NOT NULL DEFAULT false,
  posted_at                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_status ON transactions(status, created_at DESC);
CREATE INDEX idx_tx_customer ON transactions(customer_account_id, created_at DESC);
CREATE INDEX idx_tx_vault ON transactions(vault_account_id, created_at DESC);
CREATE INDEX idx_tx_currency_posted ON transactions(currency, posted_at)
  WHERE status='posted';
CREATE INDEX idx_tx_creator ON transactions(created_by_user_id, created_at DESC);

CREATE TABLE ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  account_id      UUID NOT NULL REFERENCES accounts(id),
  amount_minor    BIGINT NOT NULL CHECK (amount_minor > 0),
  side            entry_side NOT NULL,
  currency        currency_code NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_le_tx ON ledger_entries(transaction_id);
CREATE INDEX idx_le_account ON ledger_entries(account_id, created_at DESC);

CREATE TABLE transaction_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID REFERENCES transactions(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,        -- s3://bucket/key
  file_name       TEXT NOT NULL,
  content_type    TEXT,
  size_bytes      BIGINT,
  uploaded_by     UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------------------------
-- Account groups
------------------------------------------------------------------------------
CREATE TABLE account_groups (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  group_type  TEXT NOT NULL DEFAULT 'general',
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_group_members (
  group_id           BIGINT NOT NULL REFERENCES account_groups(id) ON DELETE CASCADE,
  holder_account_id  BIGINT NOT NULL REFERENCES holder_accounts(id) ON DELETE CASCADE,
  added_by           UUID,
  added_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, holder_account_id)
);

------------------------------------------------------------------------------
-- Excel import pipeline
------------------------------------------------------------------------------
CREATE TABLE account_import_batches (
  id              BIGSERIAL PRIMARY KEY,
  file_name       TEXT NOT NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  total_rows      INT NOT NULL DEFAULT 0,
  successful_rows INT NOT NULL DEFAULT 0,
  review_rows     INT NOT NULL DEFAULT 0,
  failed_rows     INT NOT NULL DEFAULT 0,
  imported_by     UUID,
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_import_staging (
  id                            BIGSERIAL PRIMARY KEY,
  import_batch_id               BIGINT REFERENCES account_import_batches(id) ON DELETE CASCADE,
  source_row_number             INT,
  raw_name                      TEXT,
  base_name_candidate           TEXT,
  canonical_name_candidate      TEXT,
  normalized_name_candidate     TEXT,
  extracted_currency_code       VARCHAR(3),
  suggested_dahab_account_number VARCHAR(32),
  suggested_account_holder_id   BIGINT,
  dahab_account_number          VARCHAR(32),
  source_account_number         VARCHAR(32),
  account_alias_name            TEXT,
  is_primary_account            BOOLEAN DEFAULT false,
  nature                        VARCHAR(8),
  confidence_score              NUMERIC(5,4),
  review_status                 VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  error_message                 TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_link_review_queue (
  id                          BIGSERIAL PRIMARY KEY,
  import_batch_id             BIGINT REFERENCES account_import_batches(id) ON DELETE CASCADE,
  staging_id                  BIGINT REFERENCES account_import_staging(id) ON DELETE CASCADE,
  source_account_number       VARCHAR(32),
  raw_name                    TEXT,
  extracted_currency_code     VARCHAR(3),
  base_name_candidate         TEXT,
  normalized_name_candidate   TEXT,
  suggested_account_holder_id BIGINT,
  confidence_score            NUMERIC(5,4),
  review_status               VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  reviewed_by                 UUID,
  reviewed_at                 TIMESTAMPTZ,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------------------------
-- FX rates (manual entry only — no auto fetch)
------------------------------------------------------------------------------
CREATE TABLE fx_rates (
  id           BIGSERIAL PRIMARY KEY,
  currency     currency_code NOT NULL,
  usd_rate     NUMERIC(18,8) NOT NULL CHECK (usd_rate > 0),
  as_of_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  source       TEXT NOT NULL DEFAULT 'manual',
  note         TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fx_currency_date ON fx_rates(currency, as_of_date DESC);

------------------------------------------------------------------------------
-- Notifications
------------------------------------------------------------------------------
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  event_type      notification_event NOT NULL,
  severity        notification_severity NOT NULL DEFAULT 'info',
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifs_user ON notifications(user_id, created_at DESC);

CREATE TABLE notification_preferences (
  user_id                 UUID PRIMARY KEY,
  enabled                 JSONB NOT NULL DEFAULT jsonb_build_object(
    'tx_posted', true,'pending_created', true,'approval_decision', true,
    'large_tx', true,'low_vault', true,'overdraft', true,
    'daily_summary', true,'account_change', true,
    'reminder_pending', true,'reminder_shift', true),
  large_tx_threshold      JSONB NOT NULL DEFAULT
    jsonb_build_object('USD',500000,'EUR',500000,'LYD',2500000),
  low_vault_threshold     JSONB NOT NULL DEFAULT
    jsonb_build_object('USD',100000,'EUR',100000,'LYD',500000),
  pending_reminder_minutes INT NOT NULL DEFAULT 30,
  quiet_hours_start       TIME,
  quiet_hours_end         TIME,
  daily_summary_enabled   BOOLEAN NOT NULL DEFAULT true,
  daily_summary_time      TIME NOT NULL DEFAULT '17:00:00',
  browser_push_enabled    BOOLEAN NOT NULL DEFAULT false,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_reminders_state (
  user_id      UUID NOT NULL,
  kind         TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  user_agent  TEXT,
  label       TEXT,
  granted     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------------------------
-- Audit log (append-only)
------------------------------------------------------------------------------
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID,
  action          TEXT NOT NULL,
  target          TEXT,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_actor   ON audit_log(actor_user_id, created_at DESC);
-- enforce append-only via REVOKE in 05_permissions.sql

------------------------------------------------------------------------------
-- WebAuthn (passkeys)
------------------------------------------------------------------------------
CREATE TABLE webauthn_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL,
  credential_id  TEXT NOT NULL UNIQUE,
  public_key     TEXT NOT NULL,
  counter        BIGINT NOT NULL DEFAULT 0,
  transports     TEXT[] NOT NULL DEFAULT '{}',
  device_label   TEXT NOT NULL DEFAULT 'This device',
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webauthn_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  email       TEXT,
  challenge   TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------------------------
-- Reports support: vault targets (for liquidity health)
------------------------------------------------------------------------------
CREATE TABLE vault_targets (
  vault_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  currency         currency_code NOT NULL,
  target_minor     BIGINT NOT NULL DEFAULT 0,
  min_minor        BIGINT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID,
  PRIMARY KEY (vault_account_id, currency)
);

------------------------------------------------------------------------------
-- Reports support: per-teller per-day stats (maintained by trigger)
------------------------------------------------------------------------------
CREATE TABLE teller_daily_stats (
  teller_user_id          UUID NOT NULL,
  day                     DATE NOT NULL,
  branch_id               BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  currency                currency_code NOT NULL,
  txns_count              INT NOT NULL DEFAULT 0,
  posted_count            INT NOT NULL DEFAULT 0,
  rejected_count          INT NOT NULL DEFAULT 0,
  volume_minor            BIGINT NOT NULL DEFAULT 0,
  avg_processing_seconds  NUMERIC(10,2),
  PRIMARY KEY (teller_user_id, day, currency)
);

------------------------------------------------------------------------------
-- Reports support: compliance (skeleton; rules to be confirmed)
------------------------------------------------------------------------------
CREATE TYPE compliance_alert_type AS ENUM (
  'Structuring','HighValueCash','Velocity','WatchlistMatch','Other'
);

CREATE TABLE compliance_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID REFERENCES transactions(id),
  holder_id       BIGINT REFERENCES account_holders(id),
  alert_type      compliance_alert_type NOT NULL,
  severity        notification_severity NOT NULL DEFAULT 'warning',
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  details         JSONB,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID
);
CREATE INDEX idx_alerts_status ON compliance_alerts(status, opened_at DESC);

------------------------------------------------------------------------------
-- Triggers: branch tagging on transactions
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transactions_fill_branch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.created_by_user_id IS NOT NULL THEN
    SELECT branch_id INTO NEW.branch_id FROM profiles WHERE id = NEW.created_by_user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tx_fill_branch BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION transactions_fill_branch();

------------------------------------------------------------------------------
-- Triggers: maintain teller_daily_stats
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION teller_stats_apply() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE d DATE;
BEGIN
  d := COALESCE(NEW.posted_at, NEW.created_at)::date;
  INSERT INTO teller_daily_stats(teller_user_id, day, branch_id, currency,
                                 txns_count, posted_count, rejected_count, volume_minor)
  VALUES (NEW.created_by_user_id, d, NEW.branch_id, NEW.currency,
          1,
          CASE WHEN NEW.status='posted' THEN 1 ELSE 0 END,
          CASE WHEN NEW.status='rejected' THEN 1 ELSE 0 END,
          CASE WHEN NEW.status='posted' THEN NEW.amount_minor ELSE 0 END)
  ON CONFLICT (teller_user_id, day, currency) DO UPDATE
    SET txns_count    = teller_daily_stats.txns_count + 1,
        posted_count  = teller_daily_stats.posted_count + EXCLUDED.posted_count,
        rejected_count= teller_daily_stats.rejected_count + EXCLUDED.rejected_count,
        volume_minor  = teller_daily_stats.volume_minor + EXCLUDED.volume_minor;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tx_teller_stats AFTER INSERT OR UPDATE OF status ON transactions
FOR EACH ROW EXECUTE FUNCTION teller_stats_apply();
