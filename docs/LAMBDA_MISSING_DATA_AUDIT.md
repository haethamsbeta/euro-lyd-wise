# Lambda Missing-Data Audit

**Backend:** `https://u2j81refrf.execute-api.eu-north-1.amazonaws.com/api`
**Auth:** Bearer JWT from `POST /auth/login` (admin role used for probes)
**Probe date:** 2026-05-10
**Mode:** lambda only — no Supabase fallback considered.

## Ground truth (from `/dashboard/staff` summary)

| Field | Value |
|---|---|
| `holder_count` | 408 |
| `holder_account_count` | 659 |
| `transaction_count` | 23,484 |
| `vault_count` | 10 |
| `pending_count` | exposed (UI key `pending_approvals` — see FE-rename) |
| `active_holders` | **NOT returned** |
| `txns_today` | **NOT returned** |

## Endpoint reality matrix

Legend: ✅ = returns 200 with data, ⚠️ = 200 but empty/partial, ❌ = 404 not implemented, 🔒 = 403 (exists, role-gated).

| Endpoint | Status | Notes |
|---|---|---|
| `GET /health` | ✅ | service/mode/currencies |
| `POST /auth/login` | ✅ | returns `access_token`, `refresh_token`, `user` |
| `GET /auth/me` | ✅ | session user |
| `POST /auth/refresh` | ❌ | not GET; method untested but route absent on GET |
| `GET /dashboard/staff` | ✅ | summary + vault_balances_by_currency + recent_transactions |
| `GET /dashboard/teller` | ❌ | |
| `GET /dashboard/auditor` | ❌ | |
| `GET /holders` | ✅ | paged `{items,next_cursor}` |
| `GET /holders/:id` | ✅ | includes `accounts[]` inline |
| `GET /holders/:id/accounts` | ✅ | paged |
| `GET /holders/:id/totals` | ❌ | |
| `GET /holder-accounts/:id` | ❌ | single-account detail missing |
| `GET /holder-accounts/:id/ledger` | ❌ | **ledger endpoint not implemented** |
| `GET /transactions` | ✅ | paged; supports `status`, `limit` |
| `GET /transactions/:id` | ❌ | **detail endpoint not implemented** |
| `GET /vaults` | ✅ | all 10 with balance/inflow/outflow/last_tx |
| `GET /vaults/:id` | ✅ | single vault |
| `GET /vaults/:id/activity` | ❌ | |
| `GET /approvals/pending` | ❌ | (use `/transactions?status=pending` — currently empty) |
| `GET /users` | ❌ | |
| `GET /audit` | ❌ | |
| `GET /groups` | ❌ | |
| `GET /admin/branches` | ❌ | |
| `GET /admin/fx-rates` | ❌ | |
| `GET /admin/vault-targets` | ❌ | |
| `GET /notifications` | ❌ | |
| `GET /portal/me`, `/portal/accounts` | ❌ | entire portal namespace missing |
| `GET /reports/business/overview` | ✅ | counts/volumes/growth/top accounts |
| `GET /reports/cash-flow` | ✅ | per-day per-currency direction split |
| `GET /reports/hourly-traffic` | ✅ | hour_of_day buckets |
| `GET /reports/tellers/today` | ⚠️ | returns `{items: []}` — empty (no teller activity recorded today, or join missing) |
| `GET /reports/liquidity-health` | ✅ | per-vault balance vs target/min |
| `GET /reports/compliance/overview` | ⚠️ | only `alert_volume_daily` + `risk_typology` (both empty); missing flagged/pending/resolved/kyc/aml gauges |
| `GET /reports/processing-time-distribution` | ✅ | bucket counts |
| `GET /reports/rejection-rate-trend` | ✅ | per-day rate |
| All write endpoints (POST/PATCH/DELETE) | ❓ | not exercised in this audit — see "Write endpoints" section |

## Field-naming mismatches (pure FE rename)

| Backend field | UI field expected | Affected types/pages |
|---|---|---|
| `full_name` | `holder_name` | `Holder` interface, holders list/detail |
| `phone_number` | `phone` | `Holder`, `HolderAccount` |
| `summary.pending_count` | `pending_approvals` | dashboard adapter |
| `summary.holder_count` etc. | already mapped (✓) | — |
| `vault_balances_by_currency[].balance_minor` | `cash_minor` + `bank_minor` split | dashboard adapter currently maps all to `cash_minor`; bank/cash split is **not provided by backend** |
| Transaction `amount_minor` (string) | `debit_amount`/`credit_amount` (number) | tx list/detail; FE must derive from `direction` + `amount_minor` |
| Transaction `comment` | `description` | tx rows |
| Transaction `posted_at` | present ✓ | — |
| HolderAccount `current_balance_minor` (string) | `current_balance` (number) | both forms present in payload (✓) |

---

## Per-page audit

Format: route → endpoint(s) → expected fields → returned fields → missing → fix class → current UI state → recommended fix.

### 1. Dashboard — `/app`, `/m/dashboard`
- **Endpoint:** `GET /dashboard/staff`, `GET /vaults`, `GET /transactions?limit=8`
- **UI expects:** holder_count, holder_account_count, transaction_count, vault_count, pending_approvals, txns_today, active_holders, recent transactions with holder name + amount/direction.
- **Returned:** holder/holder_account/transaction/vault/`pending_count`. Recent transactions: id, tx_number, direction, channel, amount_minor, currency, status, category, comment — but **no holder name and no account number**.
- **Missing:** `txns_today`, `active_holders`, holder/account display on recent rows.
- **Fix class:** FE rename (`pending_count` → `pending_approvals`). BE-extend (add `txns_today`, `active_holders` to summary; join `holder_name` + `dahab_account_number` into recent_transactions).
- **Current UI:** real KPI strip; recent activity rows show tx_number + amount only.
- **Recommended fix:** map `pending_count` now; ticket BE for the two summary fields and the join.

### 2. Holders list — `/app/holders`
- **Endpoint:** `GET /holders?limit=200`
- **Expected:** total=408, linked accounts=659, per-row: holder_name, dahab_account_number, status, linked_account_count, phone, currency totals chip.
- **Returned:** full_name, dahab_account_number, status, linked_account_count, phone_number, holder_type, created_at.
- **Missing:** per-holder currency totals (UI computes from loaded sample only — labelled "(loaded)").
- **Fix:** FE rename `full_name`/`phone_number`. BE-new for true currency totals per holder (or per-currency aggregation endpoint). Cursor pagination already present (`next_cursor`); FE must wire it.
- **UI now:** real names render via fallback chain; pagination missing.

### 3. Holder detail — `/app/holders/$id`
- **Endpoint:** `GET /holders/:id`
- **Expected:** holder profile + accounts list + per-currency totals + recent activity for the holder.
- **Returned:** holder fields + `accounts[]` inline (full account shape with balances, withdraw limit, available_to_withdraw).
- **Missing:** holder-scoped recent transactions, holder totals (`/holders/:id/totals` is 404).
- **Fix:** BE-new `/holders/:id/totals`, BE-new `/holders/:id/transactions`. FE meanwhile filters `/transactions?holder_id=` if backend accepts (untested — likely not).
- **UI now:** profile + accounts real; "Recent activity" empty/dash.

### 4. Holder accounts (within holder detail) — `/app/holders/$id` accounts tab
- **Endpoint:** `GET /holders/:id/accounts`
- **Expected fields:** account_number, dahab_account_number, account_display_name, currency_code, account_nature, current_balance, status, withdraw_limit, available_to_withdraw, ledger count.
- **Returned:** all of the above EXCEPT `linked_ledger_count`. Withdraw limit fields, `available_to_withdraw_minor`/`available_to_withdraw` present ✓.
- **Missing:** ledger row count (backend extension).
- **Fix:** FE mapping is already correct; BE-extend for ledger count if needed (P2).

### 5. Account ledger — `/app/accounts/$id`
- **Endpoint:** `GET /holder-accounts/:id`, `GET /holder-accounts/:id/ledger`
- **Expected:** account header + ledger entries (tx_number, posted_at, description, debit, credit, balance_after, currency).
- **Returned:** **both endpoints return 404**.
- **Missing:** the entire account-detail page is unreachable.
- **Fix:** **BE-new** for both. P0.
- **UI now:** error/empty state.

### 6. Transactions list — `/app/transactions`
- **Endpoint:** `GET /transactions?limit=50&offset=...`
- **Expected:** tx_number, posted_at, direction, amount, currency, status, channel, account ref, **holder/customer name**, **customer account number**, comment, category.
- **Returned:** id, tx_number, holder_account_id, account_id, vault_account_id, currency_code, currency, direction, channel, amount_minor (string), comment, status, transaction_category, posted_at, created_at, source_system. **No holder name, no dahab_account_number, no account_number** (only ids).
- **Missing:** holder/customer denormalized fields.
- **Fix:** **BE-extend** — backend must join and return `holder_name`, `dahab_account_number`, `account_display_name` on each row. (Preferred over N FE round-trips.) FE: parse `amount_minor` as number, derive debit/credit from `direction`.
- **UI now:** rows render tx_number + amount + direction; customer column empty.
- **Priority:** P0.

### 7. Transaction detail — `/app/transactions/$id`
- **Endpoint:** `GET /transactions/:id` → **404**.
- **Fix:** **BE-new**. Must include all list fields + audit info (created_by, approved_by, rejected_by, reject_reason, correction_reason, reverses_tx_id, corrected_by_tx_id, partial_approved) — those keys already appear on dashboard's recent_transactions, so backend already has them.
- **Priority:** P0.

### 8. New deposit — `/app/transactions/new/deposit`
- **Endpoint expected:** `POST /transactions` with `transaction_category=cash`, `direction=deposit`, idempotency_key.
- **Status:** not exercised by this audit. Listed in write-endpoints section.
- **Recommendation:** keep submit disabled until BE confirms. P3 until BE confirms.

### 9. New withdrawal — `/app/transactions/new/withdraw`
- Same as #8.

### 10. Approvals — `/app/approvals`
- **Endpoint:** `GET /approvals/pending` → 404. Audit also tried `GET /transactions?status=pending` → 200 but empty.
- **Expected:** pending tx list + approve/reject actions.
- **Fix:** BE-new `/approvals/pending` (or document `/transactions?status=pending` as canonical) and `POST /approvals/:id/approve|reject`. P1.

### 11. Vaults list — `/app/vaults`
- **Endpoint:** `GET /vaults`
- **Expected:** name, currency_code, internal_role, balance_minor, inflow_minor, outflow_minor, transaction_rows, last_transaction_date.
- **Returned:** all of the above ✓ (10 rows).
- **Missing:** none.
- **Fix:** none — UI already renders correctly.

### 12. Vault detail — `/app/vaults/$id`
- **Endpoint:** `GET /vaults/:id` ✓, `GET /vaults/:id/activity` → 404.
- **Missing:** recent vault-scoped transactions.
- **Fix:** BE-new `/vaults/:id/activity` returning rows with tx_number, posted_at, description, debit_minor, credit_minor, balance_after_minor. P1.
- **UI now:** header real; activity feed empty.

### 13. Reports overview — `/app/reports`
- **Endpoint:** `GET /reports/business/overview` ✓
- **Expected:** counts (tx_total, tx_posted, tx_rejected, active_holders), volume_by_currency_30d, daily_volume_7d, currency_distribution, customer_growth_7m, top_accounts.
- **Returned:** all of the above with rich data ✓.
- **Missing:** nothing critical for this widget.
- **Fix:** FE — ensure all six sub-shapes are mapped (some appear unused today).

### 14. Reports cash flow
- **Endpoint:** `GET /reports/cash-flow` ✓
- **Returned:** `{items:[{day,currency_code,direction,transaction_count,volume_minor}]}`. Note: per-currency, per-direction split (deposits/withdrawals) — UI currently expects flat `{deposits_minor,withdrawals_minor}` per day.
- **Fix:** **FE mapping** — pivot rows by `direction` to produce the chart shape; group by currency.

### 15. Reports tellers — `/app/reports` tellers tab
- **Endpoint:** `GET /reports/tellers/today` ✓ but `items: []`.
- **Returned shape:** unknown (empty array). UI expects rank/name/branch/avatar/txns_today/volume/avg/accuracy/avg_time/streak/trend.
- **Fix:** BE-extend — confirm row schema; populate when teller activity exists. Show empty state today (no fabrication). P2.

### 16. Reports compliance
- **Endpoint:** `GET /reports/compliance/overview` ⚠️
- **Returned:** `{alert_volume_daily:[], risk_typology:[]}`.
- **Missing:** `flagged_txns`, `pending_reviews`, `resolved_today`, `high_risk_holders`, `kyc/aml/doc_verification/sanctions` gauges.
- **Fix:** **BE-extend** — endpoint exists but returns minimal shape. P1.

### 17. Audit log — `/app/audit`
- **Endpoint:** `GET /audit` → **404**.
- **Fix:** BE-new with paged `{items:[{id,actor,action,target_type,target_id,occurred_at,metadata}]}` + `summary.audit_count`. P1.

### 18. Users — `/app/users`
- **Endpoint:** `GET /users` → **404**.
- **Fix:** BE-new `GET /users` returning `{items:[{id,email,display_name,role,status,last_login_at,created_at}]}`, plus `summary.user_count`. P0 for staff management.

### 19. Groups — `/app/groups`, `/app/groups/$id`
- **Endpoint:** `GET /groups` → **404**.
- **Fix:** BE-new — entire feature blocked. P2.

### 20. Portal accounts (admin view) — `/app/portal-accounts`
- **Endpoint:** consumer-portal admin index.
- **Status:** depends on portal namespace, all `/portal/*` are 404.
- **Fix:** BE-new portal namespace. P3.

### 21. Consumer portal — `/portal/$accountId/$currency`
- **Endpoints expected:** `/portal/me`, `/portal/accounts`, `/portal/accounts/:id/ledger`.
- **Status:** all 404.
- **Fix:** BE-new entire `/portal` namespace. P3.

### 22. FX rates admin — `/app/admin/fx-rates`
- **Endpoint:** `GET /admin/fx-rates` → **404**, `POST /admin/fx-rates` → untested (assume absent).
- **Fix:** BE-new. P1 (blocks consolidated USD calculation in vaults).

### 23. Branches admin — `/app/admin/branches`
- **Endpoint:** `GET /admin/branches` → **404**.
- **Fix:** BE-new. P2.

### 24. Notifications settings — `/app/settings/notifications`
- **Endpoint:** `GET /notifications` → **404**, plus push subscription endpoints unknown.
- **Fix:** BE-new `/notifications`, `/notifications/preferences`. P2.

### 25. Push settings (security) — `/app/settings/security`
- **Endpoints expected:** webauthn challenge/verify, push subscribe.
- **Status:** not in this audit (server functions, not Lambda routes).
- **Fix:** out of scope for Lambda audit.

### 26. About / backend diagnostics — `/app/about`
- **Endpoint:** `GET /health` ✓, `GET /health/db` → 404.
- **Fix:** BE-new `/health/db` and `/health/version` for diagnostics. P3.

---

## Specific deep-dives requested

### Transactions list — required join

Backend currently returns only foreign keys (`holder_account_id`, `account_id`, `vault_account_id`). For the UI to show "customer name" and "customer account number" without N+1 fetches, the list endpoint must denormalize:

```
holder_name           ← account_holders.full_name
dahab_account_number  ← account_holders.dahab_account_number
account_display_name  ← holder_accounts.account_display_name
account_number        ← holder_accounts.account_number
```

**Classification:** BE-extend (`/transactions` and `/transactions/:id`). P0.

### Holder accounts

Backend already returns every required field except `linked_ledger_count`. Once `/holder-accounts/:id/ledger` exists, ledger count can be derived from its envelope.

**Classification:** BE-new for ledger; FE mapping otherwise complete. P0 (ledger), P2 (count).

### Account ledger

Endpoint `/holder-accounts/:id/ledger` returns 404. Required response items:

```
{ id, tx_number, posted_at, description, debit_minor, credit_minor,
  balance_after_minor, currency_code, source_tx_id }
```

**Classification:** BE-new. P0.

### Vaults

`/vaults` already returns balance/inflow/outflow/transaction_rows/last_transaction_date for all 10. Missing piece is `/vaults/:id/activity` for the detail page.

**Classification:** BE-new for activity. P1.

### Reports

Status:

- ✅ business/overview, cash-flow (FE pivot needed), hourly-traffic, liquidity-health, processing-time-distribution, rejection-rate-trend.
- ⚠️ tellers/today (empty), compliance/overview (skeletal).
- No backend gap on the first list — issues are FE mapping (cash-flow pivot) or BE-extend (compliance fields).

### Users

`GET /users` is 404 — feature blocked. Required:

```
GET /users?limit=&offset=  →  { items:[{id,email,display_name,role,status,
                                         last_login_at,must_change_password,
                                         created_at}], next_cursor }
```

Plus `summary.user_count` on `/dashboard/staff`. **P0.**

---

## Write endpoints — not enabled

Until backend confirms each, keep submit/approve UI disabled and surface a "Backend write not yet enabled" state. None probed in this audit.

| Action | Endpoint | UI page |
|---|---|---|
| Post transaction (deposit/withdraw/general) | `POST /transactions` | New deposit, New withdrawal |
| Approve | `POST /approvals/:id/approve` | Approvals |
| Reject | `POST /approvals/:id/reject` | Approvals |
| Correct transaction | `POST /transactions/:id/correct` | Tx detail |
| Set withdraw limit | `POST /holder-accounts/:id/withdraw-limit` | Account detail |
| Statement PDF | `GET /holder-accounts/:id/statement.pdf` | Account detail |
| Create holder | `POST /holders` | New holder |
| Update holder | `PATCH /holders/:id` | Holder detail |
| Add linked account | `POST /holders/:id/accounts` | Holder detail |
| Set FX rate | `POST /admin/fx-rates` | FX rates |
| Set vault target | `POST /admin/vault-targets` | Vault admin |
| Consolidated USD | `POST /vaults/consolidated-usd` | Vaults |

---

## Priority summary

| Page | Missing info | FE fix? | BE fix? | Priority |
|---|---|---|---|---|
| Dashboard | `txns_today`, `active_holders`, holder name on recent rows; `pending_count`→`pending_approvals` rename | yes (rename) | yes (extend) | P0 |
| Holders list | `full_name`/`phone_number` rename; cursor pagination wiring; per-holder currency totals | yes | yes (totals) | P1 |
| Holder detail | holder totals, holder-scoped tx feed | no | yes (new) | P1 |
| Holder accounts | linked_ledger_count | no | yes (extend) | P2 |
| Account ledger | entire endpoint | no | yes (new `/holder-accounts/:id`, `/.../ledger`) | **P0** |
| Transactions list | holder name, dahab_account_number, account_display_name; `comment`→`description` rename; amount derivation | yes (rename/derive) | yes (join) | **P0** |
| Transaction detail | endpoint missing | no | yes (new `/transactions/:id`) | **P0** |
| New deposit | write endpoint | n/a | yes (confirm `POST /transactions`) | P3 |
| New withdrawal | write endpoint | n/a | yes | P3 |
| Approvals | list + approve/reject | no | yes (new) | P1 |
| Vaults list | none | no | no | — |
| Vault detail | `/vaults/:id/activity` | no | yes (new) | P1 |
| Reports overview | none material | yes (wire unused fields) | no | P2 |
| Reports cash flow | pivot rows by direction | **yes (FE only)** | no | P1 |
| Reports tellers | empty data | no | yes (extend / data) | P2 |
| Reports compliance | flagged/pending/resolved/kyc/aml gauges | no | yes (extend) | P1 |
| Audit log | endpoint | no | yes (new) | P1 |
| Users | endpoint | no | yes (new `/users`, `summary.user_count`) | **P0** |
| Groups | endpoint | no | yes (new) | P2 |
| Portal accounts (admin) | endpoint | no | yes (new) | P3 |
| Consumer portal | entire `/portal/*` | no | yes (new) | P3 |
| FX rates | endpoint | no | yes (new) | P1 |
| Branches | endpoint | no | yes (new) | P2 |
| Notifications | endpoint | no | yes (new) | P2 |
| Push settings | server-fn flow, not Lambda | n/a | n/a | — |
| About diagnostics | `/health/db`, `/health/version` | no | yes (new) | P3 |

---

## Frontend mapping fixes safe to apply now (no new backend)

These can be implemented without any backend change because the field already exists in the live payload:

1. **Holder type (`Holder`)** — alias backend `full_name` → `holder_name`, `phone_number` → `phone` in `src/lib/api/holders.ts` adapter (or rename type).
2. **Dashboard adapter** — map `summary.pending_count` to `pending_approvals` (today it reads `pending_approvals` which the backend doesn't send).
3. **Cash-flow chart** — pivot the per-direction rows in `src/lib/api/reports.ts` (or in the chart) into the `{day, deposits_minor, withdrawals_minor}` shape the UI expects.
4. **Recent transactions row mapping** — `comment` → description label; derive `debit/credit` from `direction` + `amount_minor`. Until BE join lands, render `holder_account_id` short id with a "(name pending)" tag rather than blank.
5. **Vault list** — already complete; remove any "(loaded)" labels on per-vault metrics since backend already exposes totals.
6. **Reports overview** — wire `currency_distribution`, `customer_growth_7m`, `top_accounts` (already returned) into existing widgets.

Items 1–6 are the only changes that should be made on the frontend in response to this audit. Everything else requires backend work and must surface as an empty/dash state in the meantime — no fabricated values.

---

## Backend ticket appendix (consolidated)

### P0 — blocks core read-only app
1. `GET /transactions/:id` — full transaction detail (mirrors recent_transactions row schema).
2. `GET /holder-accounts/:id` — single holder-account.
3. `GET /holder-accounts/:id/ledger` — paged ledger entries.
4. `GET /transactions` — denormalize `holder_name`, `dahab_account_number`, `account_display_name`, `account_number` onto each row.
5. `GET /dashboard/staff` summary additions: `txns_today`, `active_holders`, `user_count`, `audit_count`.
6. `GET /dashboard/staff` recent_transactions: same denormalization as #4.
7. `GET /users` (paged).

### P1
8. `GET /transactions/:id/...` audit fields exposed (already in payload — keep them).
9. `GET /holders/:id/totals`, `GET /holders/:id/transactions`.
10. `GET /vaults/:id/activity`.
11. `GET /approvals/pending` (or document `/transactions?status=pending` and add `POST /approvals/:id/approve|reject`).
12. `GET /reports/compliance/overview` — extend to include flagged/pending/resolved/high-risk + kyc/aml/doc/sanctions gauges.
13. `GET /audit` (paged).
14. `GET /admin/fx-rates`, `POST /admin/fx-rates`.

### P2
15. `GET /reports/tellers/today` — populated rows.
16. `GET /admin/branches`, `GET /admin/vault-targets`.
17. `GET /notifications`, preferences.
18. `GET /groups`, `GET /groups/:id`.

### P3 — write paths and portal
19. `POST /transactions` (deposit/withdraw/general), `POST /transactions/:id/correct`.
20. `POST /holder-accounts/:id/withdraw-limit`, `GET /holder-accounts/:id/statement.pdf`.
21. `POST /holders`, `PATCH /holders/:id`, `POST /holders/:id/accounts`.
22. Entire `/portal/*` namespace.
23. `GET /health/db`, `GET /health/version`.

---

**Rule reaffirmed:** no mock data, no Supabase fallback in lambda mode, no fabricated values. Every gap above either lands as an empty state, a `—`, or a "Backend not connected" panel until the backend ticket is delivered.
