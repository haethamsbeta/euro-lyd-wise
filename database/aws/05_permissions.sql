-- DAHAB — Roles, GRANTs, RLS policies.
--
-- BOOTSTRAP: on a fresh RDS instance the three app roles below do not exist
-- yet, so this file MUST be executed by the RDS master/admin user. After
-- this script completes, all subsequent schema migrations should be run
-- as `dahab_migrations`.

-- App-layer DB users (idempotent — safe to re-run).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dahab_migrations') THEN
    CREATE ROLE dahab_migrations LOGIN PASSWORD 'CHANGE_ME_FROM_SECRETS_MANAGER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dahab_app') THEN
    CREATE ROLE dahab_app       LOGIN PASSWORD 'CHANGE_ME_FROM_SECRETS_MANAGER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dahab_readonly') THEN
    CREATE ROLE dahab_readonly  LOGIN PASSWORD 'CHANGE_ME_FROM_SECRETS_MANAGER';
  END IF;
END $$;

GRANT CONNECT ON DATABASE dahab TO dahab_app, dahab_readonly, dahab_migrations;
GRANT USAGE   ON SCHEMA public  TO dahab_app, dahab_readonly, dahab_migrations;

-- Migrations role: full DDL on public schema, but NOT a superuser.
-- Owns future migrations and is the role used to author SECURITY DEFINER
-- procedures so they execute with migration-level privileges.
GRANT CREATE ON SCHEMA public TO dahab_migrations;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO dahab_migrations;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO dahab_migrations;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO dahab_migrations;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO dahab_migrations;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dahab_migrations;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO dahab_migrations;

-- Read-only role
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dahab_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dahab_readonly;

-- App role: SELECT everything, INSERT/UPDATE on the writable surface,
-- and EXECUTE on every stored procedure (the only legitimate write path
-- for transactions/ledger).
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO dahab_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO dahab_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO dahab_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO dahab_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO dahab_app;

-- HARD DENY: append-only audit log + financial tables can't be written directly.
REVOKE INSERT, UPDATE, DELETE ON audit_log         FROM dahab_app;
REVOKE INSERT, UPDATE, DELETE ON transactions      FROM dahab_app;
REVOKE INSERT, UPDATE, DELETE ON ledger_entries    FROM dahab_app;
-- audit_log is written only by SECURITY DEFINER procedures (functions own=migrations user)
-- transactions/ledger_entries written only by post_transaction/approve/correct/etc.

-- ==== RLS ====
ALTER TABLE profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_holders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE holder_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE holder_ledger_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_group_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_alerts        ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY profiles_self ON profiles FOR SELECT USING (id = current_user_id() OR is_staff(current_user_id()));
CREATE POLICY profiles_self_upd ON profiles FOR UPDATE USING (id = current_user_id());

-- Roles
CREATE POLICY roles_read ON user_roles FOR SELECT USING (user_id = current_user_id() OR has_role(current_user_id(),'admin'));
CREATE POLICY roles_admin_write ON user_roles FOR ALL USING (has_role(current_user_id(),'admin')) WITH CHECK (has_role(current_user_id(),'admin'));

-- Holders
CREATE POLICY holders_read ON account_holders FOR SELECT USING (is_staff(current_user_id()) OR owner_user_id = current_user_id());
CREATE POLICY holders_admin_write ON account_holders FOR ALL USING (has_role(current_user_id(),'admin')) WITH CHECK (has_role(current_user_id(),'admin'));

CREATE POLICY haccts_read ON holder_accounts FOR SELECT USING (
  is_staff(current_user_id()) OR EXISTS (SELECT 1 FROM account_holders h WHERE h.id=account_holder_id AND h.owner_user_id=current_user_id())
);
CREATE POLICY haccts_admin_write ON holder_accounts FOR ALL USING (has_role(current_user_id(),'admin')) WITH CHECK (has_role(current_user_id(),'admin'));

CREATE POLICY hled_read ON holder_ledger_entries FOR SELECT USING (
  is_staff(current_user_id()) OR EXISTS (
    SELECT 1 FROM holder_accounts a JOIN account_holders h ON h.id=a.account_holder_id
    WHERE a.id=account_id AND h.owner_user_id=current_user_id())
);

-- Accounts / balances
CREATE POLICY accts_read ON accounts FOR SELECT USING (is_staff(current_user_id()) OR owner_user_id=current_user_id());
CREATE POLICY accts_admin_write ON accounts FOR ALL USING (has_role(current_user_id(),'admin')) WITH CHECK (has_role(current_user_id(),'admin'));

CREATE POLICY bal_read ON account_balances FOR SELECT USING (
  is_staff(current_user_id()) OR EXISTS (SELECT 1 FROM accounts a WHERE a.id=account_id AND a.owner_user_id=current_user_id())
);

-- Transactions / ledger
CREATE POLICY tx_read ON transactions FOR SELECT USING (
  is_staff(current_user_id()) OR EXISTS (SELECT 1 FROM accounts a WHERE a.id=customer_account_id AND a.owner_user_id=current_user_id())
);
CREATE POLICY le_read ON ledger_entries FOR SELECT USING (
  is_staff(current_user_id()) OR EXISTS (SELECT 1 FROM accounts a WHERE a.id=account_id AND a.owner_user_id=current_user_id())
);

-- Notifications
CREATE POLICY notif_self ON notifications FOR SELECT USING (user_id=current_user_id());
CREATE POLICY notif_self_upd ON notifications FOR UPDATE USING (user_id=current_user_id());
CREATE POLICY prefs_self ON notification_preferences FOR ALL USING (user_id=current_user_id()) WITH CHECK (user_id=current_user_id());

-- Audit
CREATE POLICY audit_read ON audit_log FOR SELECT USING (has_role(current_user_id(),'admin') OR has_role(current_user_id(),'auditor'));

-- FX / branches
CREATE POLICY fx_staff_read ON fx_rates FOR SELECT USING (is_staff(current_user_id()));
CREATE POLICY fx_admin_write ON fx_rates FOR ALL USING (has_role(current_user_id(),'admin')) WITH CHECK (has_role(current_user_id(),'admin'));
CREATE POLICY br_staff_read ON branches FOR SELECT USING (is_staff(current_user_id()));
CREATE POLICY br_admin_write ON branches FOR ALL USING (has_role(current_user_id(),'admin')) WITH CHECK (has_role(current_user_id(),'admin'));

-- Groups
CREATE POLICY g_staff_read ON account_groups FOR SELECT USING (is_staff(current_user_id()));
CREATE POLICY g_admin_write ON account_groups FOR ALL USING (has_role(current_user_id(),'admin')) WITH CHECK (has_role(current_user_id(),'admin'));
CREATE POLICY gm_staff_read ON account_group_members FOR SELECT USING (is_staff(current_user_id()));
CREATE POLICY gm_admin_write ON account_group_members FOR ALL USING (has_role(current_user_id(),'admin')) WITH CHECK (has_role(current_user_id(),'admin'));

-- Compliance
CREATE POLICY ca_admin_aud ON compliance_alerts FOR SELECT
  USING (has_role(current_user_id(),'admin') OR has_role(current_user_id(),'auditor'));
CREATE POLICY ca_admin_write ON compliance_alerts FOR ALL
  USING (has_role(current_user_id(),'admin')) WITH CHECK (has_role(current_user_id(),'admin'));

-- The API layer must run, on every request:
--   SET LOCAL app.current_user_id = '<jwt-sub-uuid>';
-- Functions like has_role()/is_staff()/current_user_id() depend on this GUC.
