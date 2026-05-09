-- DAHAB — DEV ONLY seed. NEVER run in production.
BEGIN;

-- Branches
INSERT INTO branches (code, name, city) VALUES
  ('TRP','Tripoli HQ','Tripoli'),
  ('BEN','Benghazi','Benghazi'),
  ('MIS','Misrata','Misrata') ON CONFLICT DO NOTHING;

-- Three demo users (UUIDs are fixed for repeatable seeding; map to Cognito subs)
INSERT INTO profiles (id, full_name, branch_id) VALUES
  ('11111111-1111-1111-1111-111111111111','Demo Admin',  (SELECT id FROM branches WHERE code='TRP')),
  ('22222222-2222-2222-2222-222222222222','Demo Teller', (SELECT id FROM branches WHERE code='TRP')),
  ('33333333-3333-3333-3333-333333333333','Demo Auditor',NULL),
  ('44444444-4444-4444-4444-444444444444','Demo Consumer',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111','admin'),
  ('22222222-2222-2222-2222-222222222222','teller'),
  ('33333333-3333-3333-3333-333333333333','auditor'),
  ('44444444-4444-4444-4444-444444444444','consumer')
ON CONFLICT DO NOTHING;

-- Vaults
INSERT INTO accounts (id, name, kind, nature, vault_channel) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','Cash Vault — Tripoli','vault','debit','cash'),
  ('aaaaaaaa-0000-0000-0000-000000000002','Bank Vault — Tripoli','vault','debit','bank')
ON CONFLICT DO NOTHING;

INSERT INTO account_balances (account_id, currency, balance_minor) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','USD',  500000000),
  ('aaaaaaaa-0000-0000-0000-000000000001','EUR',  200000000),
  ('aaaaaaaa-0000-0000-0000-000000000001','LYD', 1500000000),
  ('aaaaaaaa-0000-0000-0000-000000000002','USD',  300000000),
  ('aaaaaaaa-0000-0000-0000-000000000002','EUR',  100000000),
  ('aaaaaaaa-0000-0000-0000-000000000002','LYD',  900000000)
ON CONFLICT DO NOTHING;

-- One sample customer (legacy + modern side)
INSERT INTO account_holders (id, dahab_account_number, canonical_name, normalized_name, owner_user_id)
VALUES (1001,'DH-100001','Ali Demo','ali demo','44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;
INSERT INTO holder_accounts (id, account_holder_id, account_number, account_display_name, currency_code, account_nature, dahab_account_number, current_balance)
VALUES (10001, 1001,'DH-100001-USD-0001','Ali Demo — USD','USD','Debit','DH-100001', 250.00)
ON CONFLICT DO NOTHING;
INSERT INTO accounts (id, name, kind, nature, owner_user_id) VALUES
  ('cccccccc-0000-0000-0000-000000000001','Ali Demo','customer','debit','44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;
INSERT INTO account_balances (account_id, currency, balance_minor) VALUES
  ('cccccccc-0000-0000-0000-000000000001','USD', 25000)
ON CONFLICT DO NOTHING;

-- Manual FX rates so report_consolidated_usd returns a number
INSERT INTO fx_rates (currency, usd_rate, as_of_date, source, note, created_by) VALUES
  ('USD', 1.000000, CURRENT_DATE,'manual','seed','11111111-1111-1111-1111-111111111111'),
  ('EUR', 1.080000, CURRENT_DATE,'manual','seed','11111111-1111-1111-1111-111111111111'),
  ('LYD', 0.205000, CURRENT_DATE,'manual','seed','11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

COMMIT;
