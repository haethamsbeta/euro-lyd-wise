# DAHAB — Backend Source of Truth

> Single authoritative spec for the backend developer building the AWS RDS +
> API layer that serves the existing DAHAB frontend. Every metric, insight,
> chart, badge, and KPI on every screen is fetched from the backend. **No
> business value, threshold, FX rate, or computed metric is hardcoded in the
> frontend.** If a number appears on screen it MUST be returned by an
> endpoint listed in this document.

Companion files:
- `docs/backend/openapi.yaml` — full OpenAPI 3.1 spec (codegen-ready).
- `docs/backend/metrics.catalog.json` — machine-readable list of every metric.
- `database/aws/01_schema.sql` — tables, enums, triggers.
- `database/aws/02_views.sql` — reporting views.
- `database/aws/03_stored_procedures.sql` — `post_transaction`, `approve_transaction`, `correct_transaction`, `report_consolidated_usd`, …
- `database/aws/05_permissions.sql` — RLS policies, role grants.
- `docs/DATABASE_CONTRACT.md`, `docs/API_CONTRACT.md`, `docs/REPORTS_METRIC_MAPPING.md`, `docs/DATA_INTEGRITY_RULES.md`, `docs/AWS_SECURITY_REQUIREMENTS.md` — module-level details.

---

## 1. Architecture overview

```text
┌────────────────────┐    HTTPS+JWT     ┌────────────────────┐    SQL/RPC    ┌─────────────────────┐
│  TanStack Start    │ ───────────────▶ │  API gateway       │ ────────────▶ │ AWS RDS PostgreSQL  │
│  (Vite, React 19)  │                  │  (Node/Express or  │               │ 15+ (RLS enforced)  │
│  src/lib/dahabApi  │ ◀─────────────── │  Lambda + APIGW)   │ ◀──────────── │ views + stored proc │
└────────────────────┘   JSON envelope  └────────────────────┘               └─────────────────────┘
         │                                       │                                    │
         │ no business logic                     │ verifies JWT, sets                 │ RLS uses
         │ no thresholds                         │   app.current_user_id              │   GUCs
         │ no FX rates                           │   app.current_role GUCs            │
         │ no SQL                                │ never returns service-role data    │
```

Hard rules:

1. **Frontend is a presentation layer.** It only reads/writes via the endpoints in §3. It must never compute totals across currencies, never apply thresholds, never invent FX rates.
2. **All money is `*_minor` (integer).** Display formatting is the only numeric operation allowed in the frontend (`src/lib/format.ts`).
3. **Currencies are never summed across codes** unless the backend explicitly returns a USD-equivalent (only `report_consolidated_usd`).
4. **FX rates are entered by admins.** No auto-fetch, ever.
5. **All responses use the standard envelope** from `API_RESPONSE_SHAPES.md`: `{ success, data, message, timestamp }`.

---

## 2. Module map

| Screen / route | Roles | Primary endpoints (§3 IDs) | Tables / views |
|---|---|---|---|
| `/login`, `/forgot-password`, `/reset-password`, `/change-password` | public / authed | AUTH-1..11 | `auth.users`, `profiles`, `password_reset_tokens` |
| `/app` (Dashboard) | admin, teller | DASH-1 | `account_balances`, `transactions`, `account_holders`, `profiles` |
| `/app/holders` | admin, teller | HOLD-1..6 | `account_holders`, `holder_accounts`, `account_balances` |
| `/app/holders/$id`, `/app/accounts/$id` | admin, teller | HOLD-3, ACC-1..3 | + `ledger_entries` |
| `/app/holders/new`, `/app/users/new-consumer` | admin | HOLD-2, USR-2 | + `auth.users` |
| `/app/transactions` | admin, teller, auditor | TX-1 | `transactions` |
| `/app/transactions/new/deposit`, `/withdraw` | admin, teller | TX-2, TX-3 | + RPC `post_transaction` |
| `/app/approvals` | admin | TX-4, TX-5, TX-6 | + RPC `approve_transaction`, `correct_transaction` |
| `/app/vaults` | admin, auditor | VLT-1, VLT-2, VLT-3 | `accounts kind=vault`, `account_balances`, RPC `report_consolidated_usd`, `fx_rates_current` |
| `/app/vaults/$id` | admin, auditor | VLT-4, VLT-5 | + `transactions`, `vault_targets` |
| `/app/groups`, `/app/groups/$id` | admin | GRP-1..5 | `account_groups`, `account_group_members` |
| `/app/portal-accounts`, `/portal/...` | admin, consumer | PORT-1..3 | `holder_accounts`, `ledger_entries` |
| `/app/reports` — Business lens | admin, auditor | REP-1 | views B5–B10 + counts |
| `/app/reports` — Tellers lens | admin, auditor | REP-2..5, REP-7..8 | `teller_daily_stats`, T-series |
| `/app/reports` — Compliance lens | admin, auditor | REP-6 | `compliance_alerts`, R-series |
| `/app/audit` | admin, auditor | AUD-1 | `audit_log` |
| `/app/me/activity`, `/app/settings/notifications`, `/app/settings/security` | authed | ME-1..6 | `notifications`, `notification_preferences`, `webauthn_credentials` |
| `/app/admin/branches` | admin | ADM-1..3 | `branches` |
| `/app/admin/fx-rates` | admin | ADM-4..5 | `fx_rates`, `fx_rates_current` |
| `/app/users` | admin | USR-1..4 | `auth.users`, `profiles`, `user_roles` |
| `/m/*` (mobile) | authed | shares the same endpoints | — |

---

## 3. Endpoint catalog

All endpoints prefixed with `/api`. All return the envelope `ApiEnvelope<T>`.
All authed endpoints require `Authorization: Bearer <jwt>`. Pagination uses
`?limit=` (max 100, default 25) and `?cursor=` (opaque). All list endpoints
respond with `{ items: T[], next_cursor: string | null }`.

### 3.1 Auth (AUTH)

| ID | Method | Path | Roles | Body / query | Returns | Notes |
|---|---|---|---|---|---|---|
| AUTH-1 | POST | `/auth/login` | public | `{ email, password }` | `{ access_token, refresh_token, user: AuthMe }` | Rate-limited 10/min/IP |
| AUTH-2 | POST | `/auth/refresh` | public | `{ refresh_token }` | `{ access_token }` | |
| AUTH-3 | POST | `/auth/logout` | authed | — | `{}` | Revokes refresh token |
| AUTH-4 | POST | `/auth/forgot-password` | public | `{ email }` | `{}` | Always 200 (no enumeration) |
| AUTH-5 | POST | `/auth/reset-password` | public | `{ token, new_password }` | `{}` | |
| AUTH-6 | POST | `/auth/change-password` | authed | `{ current_password, new_password }` | `{}` | Clears `must_change_password` |
| AUTH-7 | GET | `/auth/me` | authed | — | `AuthMe` | |
| AUTH-8 | POST | `/auth/webauthn/register/begin` | authed | — | challenge | |
| AUTH-9 | POST | `/auth/webauthn/register/finish` | authed | attestation | `{ credential_id }` | |
| AUTH-10 | POST | `/auth/webauthn/login/begin` | public | `{ email }` | challenge | |
| AUTH-11 | POST | `/auth/webauthn/login/finish` | public | assertion | tokens | |

### 3.2 Dashboard (DASH)

| ID | Method | Path | Roles | Returns | Backing |
|---|---|---|---|---|---|
| DASH-1 | GET | `/dashboard/staff` | admin, teller | `DashboardStaff` | `account_balances` grouped by `kind+channel+currency`; `count(transactions WHERE status='pending')`; `count(account_holders)`; last 8 transactions |

### 3.3 Holders & accounts (HOLD, ACC)

| ID | Method | Path | Roles | Body / query | Returns |
|---|---|---|---|---|---|
| HOLD-1 | GET | `/holders` | admin, teller | `?q=&status=&type=&limit=&cursor=` | `Holder[]` |
| HOLD-2 | POST | `/holders` | admin | holder body | `Holder` |
| HOLD-3 | GET | `/holders/{id}` | admin, teller | — | `Holder` |
| HOLD-4 | PATCH | `/holders/{id}` | admin | partial holder | `Holder` |
| HOLD-5 | GET | `/holders/{id}/accounts` | admin, teller | — | `HolderAccount[]` |
| HOLD-6 | POST | `/holders/{id}/accounts` | admin | `{ currency_code, account_alias_name?, … }` | `HolderAccount` |
| ACC-1 | GET | `/accounts/{id}` | admin, teller | — | `HolderAccount` |
| ACC-2 | GET | `/accounts/{id}/ledger` | admin, teller, consumer (own) | `?from=&to=&limit=&cursor=` | `LedgerEntry[]` |
| ACC-3 | PATCH | `/accounts/{id}` | admin | `{ withdraw_limit_amount_minor?, withdraw_limit_enabled?, status?, account_alias_name? }` | `HolderAccount` |

### 3.4 Transactions (TX)

| ID | Method | Path | Roles | Body / query | Returns | Backing |
|---|---|---|---|---|---|---|
| TX-1 | GET | `/transactions` | admin, teller, auditor | `?status=&direction=&currency=&account_id=&from=&to=&q=&limit=&cursor=` | `Transaction[]` | `transactions` |
| TX-2 | POST | `/transactions/deposit` | admin, teller | `{ customer_account_id, vault_account_id, channel, currency, amount_minor, comment }` | `Transaction` | RPC `post_transaction(direction='deposit')` |
| TX-3 | POST | `/transactions/withdraw` | admin, teller | same as deposit | `Transaction` | RPC `post_transaction(direction='withdraw')` |
| TX-4 | GET | `/approvals` | admin | `?limit=&cursor=` | `Transaction[]` | `WHERE status='pending'` |
| TX-5 | POST | `/approvals/{tx_id}/approve` | admin | `{ approved_amount_minor?, comment? }` | `Transaction` | RPC `approve_transaction` |
| TX-6 | POST | `/approvals/{tx_id}/reject` | admin | `{ reject_reason }` | `Transaction` | |
| TX-7 | POST | `/transactions/{tx_id}/correct` | admin | `{ correction_reason, new_amount_minor }` | `Transaction` | RPC `correct_transaction` (immutable: appends reversing + corrected pair) |

### 3.5 Vaults (VLT)

| ID | Method | Path | Roles | Returns | Backing |
|---|---|---|---|---|---|
| VLT-1 | GET | `/vaults` | admin, auditor | `VaultAccount[]` | `accounts WHERE kind='vault'` + `account_balances` |
| VLT-2 | POST | `/vaults/consolidated-usd` | admin, auditor | `ConsolidatedUsd` | RPC `report_consolidated_usd()` |
| VLT-3 | GET | `/vaults/recent-activity?limit=8` | admin, auditor | `Transaction[]` | `transactions WHERE vault_account_id IS NOT NULL ORDER BY created_at DESC` |
| VLT-4 | GET | `/vaults/{id}` | admin, auditor | `VaultAccount & { targets, recent }` | + `vault_targets` |
| VLT-5 | GET | `/vaults/{id}/liquidity` | admin, auditor | `LiquidityHealth['rows']` | view `report_liquidity_health` filtered |

### 3.6 Groups (GRP)

| ID | Method | Path | Roles | Body | Returns |
|---|---|---|---|---|---|
| GRP-1 | GET | `/groups` | admin | `?q=&pinned=&limit=&cursor=` | `AccountGroup[]` |
| GRP-2 | POST | `/groups` | admin | `{ name, description?, group_type, is_pinned? }` | `AccountGroup` |
| GRP-3 | GET | `/groups/{id}` | admin | — | `AccountGroup & { members }` |
| GRP-4 | POST | `/groups/{id}/members` | admin | `{ holder_account_ids: number[] }` | `{ added }` |
| GRP-5 | DELETE | `/groups/{id}/members/{holderAccountId}` | admin | — | `{}` |

### 3.7 Imports (IMP)

| ID | Method | Path | Roles | Body | Returns |
|---|---|---|---|---|---|
| IMP-1 | POST | `/imports` | admin | multipart file | `ImportBatch` |
| IMP-2 | GET | `/imports` | admin | `?limit=&cursor=` | `ImportBatch[]` |
| IMP-3 | GET | `/imports/{id}/review-rows` | admin | `?status=&limit=&cursor=` | `ReviewRow[]` |
| IMP-4 | POST | `/imports/{id}/review-rows/{rowId}/decision` | admin | `{ action, account_holder_id? }` | `ReviewRow` |

### 3.8 Reports (REP)

All `/api/reports/*` are restricted to `admin` and `auditor`. Defaults `?days=30`.

| ID | Method | Path | Returns | Backing view / RPC |
|---|---|---|---|---|
| REP-1 | GET | `/reports/business/overview?days=` | `BusinessOverview` | `report_volume_by_currency_30d`, `report_daily_volume_7d`, `report_currency_distribution`, `report_customer_growth_7m`, `report_top_accounts_by_balance`, count subqueries |
| REP-2 | GET | `/reports/cash-flow?days=` | `CashFlowDaily` | `report_cash_flow_daily` |
| REP-3 | GET | `/reports/approval-speed?days=` | `ApprovalSpeed` | `report_approval_speed` |
| REP-4 | GET | `/reports/tellers/today` | `TellersToday` | `report_tellers_today` |
| REP-5 | GET | `/reports/liquidity-health` | `LiquidityHealth` | `report_liquidity_health` |
| REP-6 | GET | `/reports/compliance/overview` | `ComplianceOverview` | `report_alert_volume_daily`, `report_risk_typology` + counts |
| REP-7 | GET | `/reports/processing-time-distribution` | rows | `report_processing_time_dist` |
| REP-8 | GET | `/reports/rejection-rate-trend?days=` | rows | `report_rejection_rate_trend` |
| REP-9 | GET | `/reports/hourly-traffic` | rows | `report_hourly_traffic` |
| REP-10 | POST | `/reports/saved` | `{ id }` | persists filter set |
| REP-11 | GET | `/reports/saved` | `SavedReport[]` | |
| REP-12 | GET | `/reports/export?type=&format=csv|xlsx|pdf` | file stream | |

### 3.9 Audit (AUD)

| ID | Method | Path | Roles | Query | Returns |
|---|---|---|---|---|---|
| AUD-1 | GET | `/audit` | admin, auditor | `?actor=&action=&from=&to=&q=&limit=&cursor=&facets=` | `AuditRow[]` (+ optional `facets`) |

### 3.10 Notifications & Me (ME)

| ID | Method | Path | Roles | Returns |
|---|---|---|---|---|
| ME-1 | GET | `/me/notifications?unread=` | authed | `NotificationRow[]` (`X-Total-Count` header) |
| ME-2 | POST | `/me/notifications/{id}/read` | authed | `{}` |
| ME-3 | POST | `/me/notifications/read-all` | authed | `{ updated }` |
| ME-4 | GET | `/me/notifications/preferences` | authed | `NotificationPreferences` |
| ME-5 | PUT | `/me/notifications/preferences` | authed | `NotificationPreferences` |
| ME-6 | GET | `/me/activity` | authed | `AuditRow[]` (own actor only) |

### 3.11 Admin (ADM, USR)

| ID | Method | Path | Roles | Body | Returns |
|---|---|---|---|---|---|
| ADM-1 | GET | `/admin/branches` | admin | — | `Branch[]` |
| ADM-2 | POST | `/admin/branches` | admin | `{ code, name, city?, status }` | `Branch` |
| ADM-3 | PATCH | `/admin/branches/{id}` | admin | partial | `Branch` |
| ADM-4 | GET | `/admin/fx-rates` | admin | `?currency=&limit=` | `{ history: FxRate[], current: FxRate[] }` |
| ADM-5 | POST | `/admin/fx-rates` | admin | `{ currency, usd_rate, as_of_date, note? }` | `FxRate` |
| ADM-6 | GET | `/admin/vault-targets` | admin | — | `VaultTarget[]` |
| ADM-7 | PUT | `/admin/vault-targets` | admin | `{ vault_account_id, currency, target_minor, min_minor }[]` | `VaultTarget[]` |
| USR-1 | GET | `/admin/users` | admin | `?role=&q=&limit=&cursor=` | `UserRow[]` |
| USR-2 | POST | `/admin/users/consumer` | admin | `{ email, full_name, holder_id, … }` | `UserRow` |
| USR-3 | POST | `/admin/users` | admin | `{ email, full_name, roles[] }` | `UserRow` |
| USR-4 | PATCH | `/admin/users/{id}/roles` | admin | `{ roles: AppRole[] }` | `UserRow` |

### 3.12 Portal (consumer-facing) (PORT)

| ID | Method | Path | Roles | Returns |
|---|---|---|---|---|
| PORT-1 | GET | `/portal/accounts` | consumer | `HolderAccount[]` (own only) |
| PORT-2 | GET | `/portal/accounts/{id}/ledger` | consumer | `LedgerEntry[]` |
| PORT-3 | GET | `/portal/accounts/{id}/{currency}/statement` | consumer | PDF stream |

---

## 4. Metrics & insights catalog

Every numeric value, chart series, or status badge that appears anywhere in
the app. Each has a unique `metric_id` (also in `metrics.catalog.json`).

Currency rule legend:
- `per_currency` — one value per currency, never combined
- `count` — currency-agnostic integer
- `percentage` — 0–100 number
- `seconds` — duration
- `usd_equivalent_manual_rates` — uses `fx_rates`; missing rates returned in `missing_rates[]`

### 4.1 Dashboard (`/app`)

| metric_id | Label | Definition | Endpoint | Currency rule |
|---|---|---|---|---|
| dash.totals.cash_by_currency | Cash totals | `Σ balance_minor` of vault accounts where `channel=cash` per currency | DASH-1 | per_currency |
| dash.totals.bank_by_currency | Bank totals | same with `channel=bank` | DASH-1 | per_currency |
| dash.totals.customer_by_currency | Customer totals | `Σ balance_minor` of `kind=customer` per currency | DASH-1 | per_currency |
| dash.pending_count | Pending approvals | `count(transactions status='pending')` | DASH-1 | count |
| dash.holder_count | Total holders | `count(account_holders)` — see Q1 | DASH-1 | count |
| dash.recent_transactions | Recent activity (8) | latest 8 transactions | DASH-1 | per_currency |

### 4.2 Vaults (`/app/vaults`, `/app/vaults/$id`)

| metric_id | Label | Definition | Endpoint | Currency rule |
|---|---|---|---|---|
| vaults.balance_per_vault_currency | Vault balance | `account_balances` joined to `accounts kind=vault` | VLT-1 | per_currency |
| vaults.total_consolidated_usd | Total Consolidated Balance | `Σ balance_minor[c] × usd_rate(c, latest as_of_date) / 100` over c with non-null rate | VLT-2 | usd_equivalent_manual_rates |
| vaults.consolidated_breakdown | USD breakdown | per-currency contribution + rate + as_of | VLT-2 | per_currency |
| vaults.consolidated_missing_rates | Missing FX rates | currencies with no `fx_rates` row → CTA to `/app/admin/fx-rates` | VLT-2 | array |
| vaults.recent_activity | Recent vault activity | last 8 vault-touching transactions | VLT-3 | per_currency |
| vaults.target_vs_actual | Target vs actual | `vault_targets.target_minor` vs `account_balances.balance_minor` | VLT-4 | per_currency |
| vaults.days_of_cover | Days of cover | `balance_minor / avg_daily_outflow_minor(30d)` | VLT-5 | per_currency |
| vaults.minimum_threshold_breach | Below minimum | `balance_minor < vault_targets.min_minor` | VLT-5 | boolean |

### 4.3 Reports — Business lens

All from REP-1 unless noted.

| metric_id | Label | Definition | Backing | Currency rule |
|---|---|---|---|---|
| rep.business.tx_total | B1 Total tx | `count(transactions WHERE created_at >= now()-:days)` | inline | count |
| rep.business.tx_posted | B2 Posted | `+ status='posted'` | inline | count |
| rep.business.tx_rejected | B3 Rejected | `+ status='rejected'` | inline | count |
| rep.business.rejection_rate | B3b Rejection rate % | `rejected / total * 100` | derived | percentage |
| rep.business.active_holders | B4 Active holders | `count(account_holders WHERE status='ACTIVE')` — Q1 | inline | count |
| rep.business.volume_by_currency_30d | B5 Volume by currency | view `report_volume_by_currency_30d` | view | per_currency |
| rep.business.daily_volume_7d | B6 Daily volume sparkline | view `report_daily_volume_7d` | view | per_currency |
| rep.business.currency_distribution | B7 Currency distribution | view `report_currency_distribution` | view | per_currency |
| rep.business.customer_growth_7m | B8 Customer growth (7m) | view `report_customer_growth_7m` | view | count |
| rep.business.avg_lyd_tx | B9 Avg LYD txn value | `volume_minor[LYD] / posted_count[LYD]` | derived | LYD only |
| rep.business.top_accounts | B10 Top accounts | view `report_top_accounts_by_balance` | view | per_currency |
| rep.business.cash_flow_daily | B11 Cash flow | view `report_cash_flow_daily` pivoted on `direction` | REP-2 | per_currency |
| rep.business.approval_speed_median | B12 Approval speed (median) | view `report_approval_speed` | REP-3 | seconds |
| rep.business.tx_mix | B13 Transaction mix | counts by `direction` — `transfer` Q2 | inline | count |

### 4.4 Reports — Tellers lens

| metric_id | Label | Definition | Endpoint | Currency rule |
|---|---|---|---|---|
| rep.tellers.leaderboard | T1 Leaderboard | `teller_daily_stats WHERE day=CURRENT_DATE` joined to profiles + branches | REP-4 | per_currency |
| rep.tellers.txns_count_today | T2 Tx count | `teller_daily_stats.txns_count` | REP-4 | count |
| rep.tellers.posted_count_today | T3 Posted count | `.posted_count` | REP-4 | count |
| rep.tellers.rejected_count_today | T4 Rejected count | `.rejected_count` | REP-4 | count |
| rep.tellers.volume_today | T5 Volume | `.volume_minor` | REP-4 | per_currency |
| rep.tellers.avg_processing_seconds | T6 Avg processing time | `.avg_processing_seconds` | REP-4 | seconds |
| rep.tellers.processing_time_dist | T7 Processing distribution | view `report_processing_time_dist` | REP-7 | count |
| rep.tellers.rejection_rate_trend | T8 Rejection rate trend | view `report_rejection_rate_trend` | REP-8 | percentage |
| rep.tellers.liquidity_health | T9 Liquidity health | view `report_liquidity_health` | REP-5 | per_currency |

### 4.5 Reports — Compliance lens

| metric_id | Label | Definition | Endpoint | Currency rule |
|---|---|---|---|---|
| rep.compliance.flagged_today | Flagged today | `count(compliance_alerts WHERE opened_at::date=CURRENT_DATE)` | REP-6 | count |
| rep.compliance.pending_reviews | Pending reviews | `count(WHERE status IN ('open','reviewing'))` | REP-6 | count |
| rep.compliance.resolved_today | Resolved today | `count(WHERE resolved_at::date=CURRENT_DATE)` | REP-6 | count |
| rep.compliance.high_risk_holders | High-risk holders | `count(DISTINCT holder_id WHERE severity='high' AND status<>'closed')` | REP-6 | count |
| rep.compliance.typology | Risk typology | view `report_risk_typology` | REP-6 | count |
| rep.compliance.alert_volume_daily | Alert volume daily | view `report_alert_volume_daily` | REP-6 | count |

### 4.6 Audit (`/app/audit`)

| metric_id | Label | Definition | Endpoint |
|---|---|---|---|
| audit.rows | Audit rows | filtered `audit_log` | AUD-1 |
| audit.action_counts | Counts by action | `count(*) GROUP BY action` | AUD-1 (`?facets=action`) |

### 4.7 Notifications

| metric_id | Label | Definition | Endpoint |
|---|---|---|---|
| me.notifications.unread_count | Unread count | `count(notifications WHERE user_id=:me AND read_at IS NULL)` | ME-1 |
| me.notifications.severity_breakdown | Severity breakdown | `count GROUP BY severity` | ME-1 |

### 4.8 Holders & accounts

| metric_id | Label | Definition | Endpoint |
|---|---|---|---|
| holders.totals_by_currency | Holder portfolio total | `Σ balance_minor` per currency for the holder | HOLD-3 |
| holders.linked_account_count | Linked accounts | `count(holder_accounts)` | HOLD-1/3 |
| account.current_balance | Account balance | `holder_accounts.current_balance_minor` | ACC-1 |
| account.withdraw_limit | Withdraw limit | `withdraw_limit_amount_minor` | ACC-1 |
| account.ledger | Ledger / statement | `ledger_entries` | ACC-2 |

### 4.9 Approvals (`/app/approvals`)

| metric_id | Label | Definition | Endpoint |
|---|---|---|---|
| approvals.queue_count | Queue size | `count(transactions status='pending')` | TX-4 (`X-Total-Count`) |
| approvals.queue | Queue rows | paginated pending transactions | TX-4 |

---

## 5. FX & consolidation rules (binding)

- `fx_rates(currency, usd_rate, as_of_date, note, created_by, created_at)` is the **only** source of FX. Every row is admin-entered via ADM-5.
- View `fx_rates_current` returns the latest row per currency (`DISTINCT ON (currency) ORDER BY currency, as_of_date DESC, created_at DESC`).
- RPC `report_consolidated_usd()` returns `{ total_usd_minor, breakdown[], missing_rates[], computed_at }`.
- Currencies in `missing_rates` are **excluded** from the total. The frontend shows a "Set rates" CTA pointing at `/app/admin/fx-rates`.
- No background job, no third-party API, no environment variable, no seed rate. Ever.

---

## 6. Data integrity invariants

(see `docs/DATA_INTEGRITY_RULES.md` for the full set)

1. **Money columns are integers** (`*_minor`). Currency is a separate `currency_code` enum column.
2. **Transactions are immutable.** Edits go through `correct_transaction` (reversing pair). `posted_at` is set once.
3. **Double-entry**: every posted transaction creates two `ledger_entries` summing to zero per currency.
4. **Append-only audit**: `audit_log` denies UPDATE/DELETE via RLS.
5. **Branch auto-tag**: trigger `transactions_fill_branch` sets `transactions.branch_id` from creator's `profiles.branch_id`.
6. **Teller daily stats**: trigger on `transactions` upserts `teller_daily_stats(teller_user_id, day, branch_id, currency, …)`.
7. **Approval threshold** lives on the server (`system_settings` table, per-currency) — never on the frontend. When `amount_minor > threshold`, `post_transaction` returns the row with `status='pending'`.

---

## 7. Security model

- JWT in `Authorization: Bearer …` is verified by the API gateway.
- Gateway sets per-request Postgres GUCs:
  ```sql
  SET LOCAL app.current_user_id = '…uuid…';
  SET LOCAL app.current_role    = 'admin';
  SET LOCAL app.current_branch  = '7';
  ```
- RLS policies in `database/aws/05_permissions.sql` use these GUCs.
- Roles: `admin`, `teller`, `auditor`, `consumer`. Stored in `user_roles`, never on `profiles`.
- Per-endpoint roles: see §3 tables. `/api/reports/*` and `/api/audit` are `admin` + `auditor` only. `/api/portal/*` requires `consumer` and ownership check on `holder_accounts.owner_user_id`.
- Service-role key is **never** exposed to the frontend or any `/api/public/*` route.

Role × endpoint matrix is encoded in `docs/backend/openapi.yaml` via tags `role:admin`, `role:teller`, `role:auditor`, `role:consumer`.

---

## 8. Backend build checklist

1. **Provision** AWS RDS PostgreSQL 15+, enable `pgcrypto`.
2. **Apply schema in order**:
   ```bash
   psql … -f database/aws/01_schema.sql
   psql … -f database/aws/02_views.sql
   psql … -f database/aws/03_stored_procedures.sql
   psql … -f database/aws/05_permissions.sql
   psql … -f database/aws/04_seed_dev_data.sql   # dev only
   psql … -f database/aws/06_validation_tests.sql
   ```
3. **Implement endpoints** in the order from `docs/BACKEND_ADAPTER_PLAN.md`: AUTH → DASH → HOLD → TX → VLT → ADM → REP → AUD → ME → IMP → PORT.
4. **Generate types** for the API gateway from `docs/backend/openapi.yaml` (`openapi-typescript` or `oazapfts`). The frontend will consume the same schema so request/response shapes can never drift.
5. **Seed required reference data**: `branches`, an initial admin user with `must_change_password=true`. Do NOT seed `fx_rates`.
6. **Acceptance**: every metric in §4 returns the documented shape with the documented backing query/view; `06_validation_tests.sql` passes.

---

## 9. Open questions / Needs confirmation

| ID | Question | Default if unanswered |
|---|---|---|
| Q1 | Does `dash.holder_count` / `rep.business.active_holders` count `status='ACTIVE'` only or all rows? | Use `status='ACTIVE'`; expose both via param |
| Q2 | Add `direction='transfer'` to `transactions` enum? | Not added; B13 reports deposit/withdraw only |
| Q3 | Add GBP to `currency_code` enum? | Not added |
| Q4 | Compliance alert rules — exact thresholds for Structuring / HighValueCash / Velocity / Watchlist? | Block REP-6 until business defines rules |
| Q5 | `report_consolidated_usd` — point-in-time `as_of` param, or always latest? | Always latest |
| Q6 | Approval threshold — env var vs `system_settings` row vs per-currency? | `system_settings` table, per-currency |
| Q7 | Daily summary notification — server timezone or per-user TZ? | Per-user TZ; add `profiles.tz` |

---

_Last updated: 2026-05-09._
