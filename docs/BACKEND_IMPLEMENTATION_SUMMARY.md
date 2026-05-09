# DAHAB — Backend Implementation Summary

## 1. What the app needs from the backend
A multi-currency, double-entry ledger backend with strict role-based access,
per-user RLS for the customer portal, append-only audit log, manual FX rate
table, and a battery of reporting views. Already implemented in the Lovable
Cloud / Supabase project; this folder packages it as AWS-ready SQL.

## 2. Tables required (see `database/aws/01_schema.sql`)
Auth & roles: `profiles`, `user_roles`, `branches`.
Holders: `account_holders`, `holder_accounts`, `account_name_aliases`,
  `holder_account_limit_events`, `holder_ledger_entries`.
Modern double-entry: `accounts`, `account_balances`, `transactions`,
  `ledger_entries`, `transaction_attachments`.
Groups: `account_groups`, `account_group_members`.
Imports: `account_import_batches`, `account_import_staging`,
  `account_link_review_queue`.
FX & lookups: `fx_rates`, `currencies`.
Notifications: `notifications`, `notification_preferences`,
  `notification_reminders_state`, `push_subscriptions`.
Audit: `audit_log`.
Passkeys: `webauthn_credentials`, `webauthn_challenges`.
Reporting support: `vault_targets`, `teller_daily_stats`, `compliance_alerts`.

## 3. Views & stored procedures (`02_views.sql`, `03_stored_procedures.sql`)
Views: `report_volume_by_currency_30d`, `report_daily_volume_7d`,
`report_currency_distribution`, `report_customer_growth_7m`,
`report_top_accounts_by_balance`, `report_cash_flow_daily`,
`report_approval_speed`, `report_hourly_traffic`,
`report_processing_time_dist`, `report_rejection_rate_trend`,
`report_liquidity_health`, `report_tellers_today`,
`report_alert_volume_daily`, `report_risk_typology`, `fx_rates_current`.

Procedures: `create_holder_with_accounts`, `add_account_to_holder`,
`post_transaction`, `apply_ledger`, `approve_transaction`,
`reject_transaction`, `correct_transaction`,
`sp_set_holder_withdraw_limit`, `get_holder_currency_totals`,
`report_consolidated_usd`, `notifications_mark_read`,
`notifications_mark_all_read`, `clear_must_change_password`,
`next_dahab_account_number`, `next_holder_account_number`, `next_tx_number`,
plus admin helpers.

## 4. API endpoints required
See `docs/API_CONTRACT.md` (≈70 endpoints across auth, users, holders,
holder accounts, transactions, approvals, vaults, FX, branches, groups,
imports, dashboard, reports, audit, notifications, portal).

## 5. Frontend files to be wired later (when AWS API is ready)
- `src/routes/app.index.tsx` (dashboard queries)
- `src/routes/app.transactions.index.tsx` + `new-transaction-wizard.tsx`
- `src/routes/app.approvals.tsx`
- `src/routes/app.audit.tsx`
- `src/routes/app.holders.*`, `app.accounts.$id.tsx`
- `src/routes/app.vaults.*`, `app.admin.fx-rates.tsx`, `app.admin.branches.tsx`
- `src/routes/app.groups.*`
- `src/routes/app.users.tsx`, `app.portal-accounts.tsx`,
  `app.users.new-consumer.tsx`
- `src/routes/app.reports.tsx` (live data hooks + replace placeholder arrays)
- `src/routes/portal.tsx`, `portal.$accountId.$currency.tsx`
- `src/routes/m.dashboard.tsx`
- `src/lib/auth.tsx`, `authService*.ts`, `notifications.tsx`
- `src/server/admin.functions.ts`, `auth.functions.ts`, `webauthn*.ts`

Migration recipe in `docs/BACKEND_ADAPTER_PLAN.md`.

## 6. Currently mock / static
- All non-Business arrays inside `src/routes/app.reports.tsx` (Tellers
  leaderboard, hourly traffic, cash flow, approval trend, transaction mix,
  liquidity health, processing time, error rate, risk metrics, typology,
  alert volume).
- Per-user dashboard preferences in `localStorage`.
- `src/lib/dahabApi.ts` HTTP scaffold (unused).

## 7. Already ready for backend connection
- All Business KPIs on Reports.
- Vaults page (cards + consolidated USD via `report_consolidated_usd`).
- Dashboard cards.
- Holders / Accounts / Transactions / Approvals / Audit / Users / Groups /
  Notifications / Portal.
- Admin FX rates + Branches.

## 8. Risky / unclear
- "Active holders" count: status filter unclear (`Needs confirmation`).
- "Internal transfers" segment in transaction mix has no schema field yet.
- GBP currency: declared in some frontend types but not in the DB enum.
- Compliance alert business rules are placeholders.
- Vault targets / liquidity health: needs targets entered before view returns useful numbers.
- Tellers leaderboard: depends on `teller_daily_stats` trigger being live
  before the page can stop using demo data.
- Attachment upload UI is not yet built.

## 9. Exact next steps to connect AWS safely
1. Provision RDS PostgreSQL 15+ (Multi-AZ, KMS, private subnets).
2. Create the three DB roles via `05_permissions.sql`.
3. Run `01_schema.sql` → `02_views.sql` → `03_stored_procedures.sql` →
   `05_permissions.sql`. Then `06_validation_tests.sql` to smoke test.
4. Stand up the API layer (Lambda or ECS Fargate). Configure:
   - JWT verification against Cognito.
   - `SET LOCAL app.current_user_id` per request.
   - Endpoints in `docs/API_CONTRACT.md` with shapes from
     `docs/API_RESPONSE_SHAPES.md`.
5. Configure DNS `api.dahablibya.com` → ALB / API Gateway with TLS cert.
6. Build `src/lib/api/*` per `docs/BACKEND_ADAPTER_PLAN.md`. Do NOT swap
   page imports yet.
7. Migrate page-by-page (read-only first, write last). Run regression after
   each page.
8. Cut over auth (Cognito) — the last step. Decommission Supabase.
9. Enable CloudWatch alarms + quarterly restore drills.

This package is **documentation + SQL only** — no frontend behavior or UI
was modified.
