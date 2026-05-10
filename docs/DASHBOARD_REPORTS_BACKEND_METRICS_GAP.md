# DAHAB — Dashboard & Reports Backend Metrics Gap

Audit date: 2026-05-10. Backend base: `https://u2j81refrf.execute-api.eu-north-1.amazonaws.com/api`. Mode: `DATA_BACKEND === "lambda"` (default).

Scope: every visible card / chart / table on `/app` (Dashboard) and `/app/reports`. The goal is to keep the current design and source every value from real Lambda/DAHABDB endpoints — no Supabase fallback in lambda mode, no FE FX math, no fabricated values, no calculated totals from page rows.

Legend:

- ✅ wired to the correct endpoint and field
- 🟡 backend already returns the field — only a frontend mapping fix is required
- 🟠 currently derived from a loaded page / heuristic — wrong total
- 🔴 currently using Supabase / mock in lambda mode
- 🔵 backend endpoint or field does not exist yet — render `<BackendPending>` until shipped

Priority:

- **P0** wrong balances / wrong totals / broken account or transaction detail
- **P1** dashboard or report metric wrong, empty, or zero in lambda mode
- **P2** report polish (sparklines, streaks, target percentages)

---

## 0. Source-of-truth rules

- Dashboard KPIs / counts / pending approvals / txns_today / active_holders → `GET /dashboard/staff` only.
- Vault balances → `GET /vaults` only (`balance_minor`).
- Recent transactions list → `GET /transactions` (used for the list, **never** as a total).
- Liquidity / FX consolidation → `GET /reports/liquidity-health` only. The frontend never multiplies FX.
- All Reports widgets → `GET /reports/*` family only.
- In lambda mode there is **no** Supabase fallback. Missing data renders `<BackendPending>` for that widget only — never the whole page, never a fake number, never `0`.
- Currency must be one of `LYD, USD, EUR, GBP`. Anything else renders the literal `Currency missing`.

---

## 1. Dashboard `/app` audit

| # | UI section | FE field expected | Current endpoint | Backend fields returned today | Missing backend fields | Correct endpoint | Required response shape | FE-mapping-only? | Backend extension required? | Status | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | KPI strip — Holders | `summary.holder_count` | `/dashboard/staff` (via `useDashboardSummary`) | `summary.holder_count` | — | `/dashboard/staff` | `{summary:{holder_count:int}}` | yes | no | ✅ | — |
| 2 | KPI strip — Linked accounts | `summary.holder_account_count` | `/dashboard/staff` | `summary.holder_account_count` | — | same | `{summary:{holder_account_count:int}}` | yes | no | ✅ | — |
| 3 | KPI strip — Transactions | `summary.transaction_count` | `/dashboard/staff` | `summary.transaction_count` | — | same | `{summary:{transaction_count:int}}` | yes | no | ✅ | — |
| 4 | KPI strip — Vaults | `summary.vault_count` | `/dashboard/staff` | `summary.vault_count` | — | same | `{summary:{vault_count:int}}` | yes | no | ✅ | — |
| 5 | Pending Approvals badge | `summary.pending_approvals` | `/dashboard/staff` | `summary.pending_approvals` | — | same | `{summary:{pending_approvals:int}}` | yes | no | ✅ | — |
| 6 | Txns Today tile | `summary.txns_today` | `/dashboard/staff` (currently renders `—` when missing) | — | `summary.txns_today` | `/dashboard/staff` | `{summary:{txns_today:int}}` (count of transactions where `posted_at::date = current_date`) | no | **yes** | 🔵 | P0 |
| 7 | Active Holders tile | `summary.active_holders` | `/dashboard/staff` | usually missing | `summary.active_holders` | `/dashboard/staff` | `{summary:{active_holders:int}}` (distinct holders with ≥1 posted txn in last 30d) | no | **yes** | 🔵 | P1 |
| 8 | Network Pulse — cash totals per currency | `vault_balances_by_currency[].cash_minor` | `/dashboard/staff` + `/vaults` heuristic | `vault_balances_by_currency[].currency`, `cash_minor` (when split exposed) | `cash_minor` per currency when `bank_split_available=false` | `/dashboard/staff` | `{vault_balances_by_currency:[{currency,cash_minor,bank_minor}], summary:{bank_split_available:bool}}` | no (today FE falls back to per-vault `vault_channel` heuristic) | **yes** — server-side cash/bank split | 🟠 | P0 |
| 9 | Network Pulse — bank totals per currency | `vault_balances_by_currency[].bank_minor` | derived (always `0` in lambda) | none | `bank_minor` per currency, `bank_split_available` flag | `/dashboard/staff` | same as #8 | no | **yes** | 🔵 — render `<BackendPending>` until live | P0 |
| 10 | Recent Transactions table — amount | `amount_minor`, `currency_code` | `/transactions?limit=8` | `amount_minor`, `currency_code` | — | same | row shape includes `amount_minor:int`, `currency_code:str` | yes | no | ✅ | — |
| 11 | Recent Transactions table — holder / account labels | `holder_name`, `account_number`, `dahab_account_number` | `/transactions` (rows) — `RecentTransactionsTable` then enriches via Supabase | row already includes `holder_name`, `account_number`, `dahab_account_number` | — | `/transactions` | row: `{holder_name:str|null, account_number:str|null, dahab_account_number:str|null}` | **yes** — FE just needs to stop calling Supabase and read these fields | no | 🟡 | P1 |
| 12 | Urgent Approvals card | pending list rows | `/approvals/pending` (already wired this pass) | id, amount_minor, currency_code, direction, created_at, holder_name, account_number | — | same | array of pending tx | yes | no | ✅ | — |
| 13 | Recent Audit Events card | audit rows | `/audit?limit=` (already wired this pass) | id, action, actor, target, created_at | — | same | array of audit rows | yes | no | ✅ | — |
| 14 | Anomaly Watchlist | flagged tx list | none — currently `<BackendPending>` | — | full feed | `/reports/anomalies` (proposed) | `[{id, kind, severity:"low"|"med"|"high", holder_name, account_number, amount_minor, currency_code, opened_at, reason}]` | no | **yes** | 🔵 | P1 |
| 15 | Pinned Customers | per-holder snapshot | `/accounts/:id` + `/holders/:id/totals` per pin (planned); today partly Supabase | per-holder totals already exist via `/holders/:id/totals` | nothing missing — needs FE switch | `/accounts/:id`, `/holders/:id/totals` | `{currency_totals:[{currency,balance_minor}], linked_account_count:int}` | yes | no | 🟡 | P1 |
| 16 | Liquidity / FX health card (dashboard side) | `network_total_lyd_minor`, `missing_rates` | `/reports/liquidity-health` | `rows`, `network_total_lyd_minor`, `missing_rates` | none if FX rates configured | `/reports/liquidity-health` | see Reports section | yes | no (FE must show "Set FX rates" CTA when `missing_rates.length>0`) | ✅/🔵 | P2 |

---

## 2. Reports `/app/reports` audit

### 2.1 Business lens

| # | Widget | FE field expected | Current endpoint | Backend returned today | Missing fields | Correct endpoint | Required shape | FE-mapping-only? | Backend extension? | Status | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B1 | KPI strip (Total Volume / Transactions / Customers / Avg Value) | `volume_by_currency_30d`, `transaction_count`, `holder_count`, `avg_txn_value_lyd_minor` | `useReportsData` lambda branch returns zeros | nothing | full overview shape | `/reports/business/overview?days=30` | `{volume_by_currency_30d:[{currency,volume_minor,posted_count}], daily_volume_7d:[{day,currency,volume_minor,tx_count}], currency_distribution:[{currency,balance_minor}], customer_growth_7m:[{month,new_holders}], top_accounts_by_balance:[{account_id,name,currency,balance_minor}], transaction_count:int, posted_count:int, rejected_count:int, holder_count:int, holder_account_count:int, avg_txn_value_lyd_minor:int}` | no | **yes** | 🔵 | P1 |
| B2 | Daily Transactions chart | `daily_volume_7d` | same as B1 | none | as above | `/reports/business/overview` | `daily_volume_7d` | yes once B1 lands | depends on B1 | 🔵 | P1 |
| B3 | Balance by Currency (donut) | `currency_distribution` | same | none | as above | same | `currency_distribution` | yes once B1 lands | depends on B1 | 🔵 | P1 |
| B4 | Customer Growth (7m) | `customer_growth_7m` | same | none | as above | same | `customer_growth_7m` | yes once B1 lands | depends on B1 | 🔵 | P1 |
| B5 | Top Accounts | `top_accounts_by_balance` | same | none | as above | same | `top_accounts_by_balance` | yes once B1 lands | depends on B1 | 🔵 | P1 |
| B6 | Transaction Mix (deposits/withdrawals/transfers) | counts per category | none today | none | category counts | `/reports/business/overview` | `transaction_mix:[{name:"deposit"|"withdraw"|"internal", value_pct:number, count:int}]` | no | **yes** | 🔵 | P1 |
| B7 | Approval Speed (median min/day) | series + summary stats | none today | none | full series | `/reports/approval-speed?days=30` | `[{day, median_seconds:int, approved_count:int}]`; FE computes `min` for display | no | **yes** | 🔵 | P1 |
| B8 | Peak Hours (24h heat) | hourly buckets | `/reports/hourly-traffic` | `[{h:str, v:int}]` | none | same | as above | yes | no | ✅ | — |
| B9 | Cash Flow — Inflow vs Outflow | per `(day, currency_code, direction)` | `/reports/cash-flow` | `[{day, currency_code, direction, transaction_count, volume_minor}]` | none | same | as above; **FE pivots by `day + currency_code + direction`**, never sums across currencies | yes | no | ✅ — confirm pivot only | P2 |

### 2.2 Tellers lens

| # | Widget | FE field expected | Current endpoint | Returned today | Missing | Correct endpoint | Required shape | FE-only? | Backend extension? | Status | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Tellers KPI strip (Total Today / Avg per Teller / Best Performer / Avg Time) | aggregates over `/reports/tellers/today` | `/reports/tellers/today` | sometimes empty | per-row fields below | `/reports/tellers/today` | array of T2 row shape | yes once T2 lands | depends | 🔵 | P1 |
| T2 | Top Performers — Today + Full Teller table | `id, name, branch, txns_today, volume_today_minor, avg_value_minor, accuracy_pct, avg_time_seconds, rank, trend[7], streak_days` | `/reports/tellers/today` | partial (often `[]`) | `name, branch, txns_today, volume_today_minor, avg_value_minor, accuracy_pct, avg_time_seconds, rank, trend, streak_days` | `/reports/tellers/today` | `[{id, name, branch, txns_today:int, volume_today_minor:int, avg_value_minor:int, accuracy_pct:number, avg_time_seconds:int, rank:int, trend:int[7], streak_days:int}]` | no | **yes** | 🔵 | P1 (rank/volume/avg) · P2 (trend/streak/accuracy) |
| T3 | Volume by Teller (bar) | `volume_today_minor` per row | `/reports/tellers/today` | partial | as T2 | same | as T2 | yes once T2 lands | depends | 🔵 | P1 |
| T4 | Processing Time Distribution | bucket counts | `/reports/processing-time-distribution` | `[{bucket:str, count:int}]` | none | same | as above | yes | no | ✅ | — |
| T5 | Error & Correction Rate (rejection trend) | daily rate | `/reports/rejection-rate-trend` | `[{d:str, rate_pct:number}]` | none | same | as above | yes | no | ✅ | — |

### 2.3 Compliance lens

| # | Widget | FE field expected | Current endpoint | Returned today | Missing | Correct endpoint | Required shape | FE-only? | Backend extension? | Status | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | KPI strip — Flagged / Pending / Resolved Today / High-Risk Holders | `flagged_txns, pending_reviews, resolved_today, high_risk_holders` | `/reports/compliance/overview` | partial | all four | `/reports/compliance/overview` | `{flagged_txns:int, pending_reviews:int, resolved_today:int, high_risk_holders:int}` | no | **yes** | 🔵 | P1 |
| C2 | Compliance Health gauges (KYC / AML / Doc Verification / Sanctions) | `current_pct` + `target_pct` per metric | `/reports/compliance/overview` | usually empty | `kyc, aml, doc_verification, sanctions` each `{current_pct, target_pct}` | same | `{kyc:{current_pct,target_pct}, aml:{...}, doc_verification:{...}, sanctions:{...}}` | no | **yes** | 🔵 | P2 |
| C3 | Alert Volume Trend | daily `generated, resolved` | `/reports/compliance/overview` | usually empty | `alert_volume` | same | `alert_volume:[{d:str, generated:int, resolved:int}]` | no | **yes** | 🔵 | P1 |
| C4 | Risk Typology (pie) | `typology[]` | `/reports/compliance/overview` | usually empty | `typology` | same | `typology:[{name:str, value:int}]` | no | **yes** | 🔵 | P1 |

### 2.4 Liquidity health (cross-lens)

| # | Widget | FE field expected | Current endpoint | Returned today | Missing | Correct endpoint | Required shape | FE-only? | Backend extension? | Status | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | Liquidity Health table | `currency, balance_minor, days_of_cover, health` | `/reports/liquidity-health` | `rows[]` | none if FX configured | same | `{rows:[{currency, balance_minor:int, days_of_cover:number|null, health:"Healthy"|"Watch"|"Critical"}], network_total_lyd_minor:int|null, missing_rates:[{from,to}], generated_at:str}` | yes | no | ✅ | — |
| L2 | Network total (LYD-equiv) | `network_total_lyd_minor` | `/reports/liquidity-health` | included | shows "FX rates missing" CTA when `missing_rates` non-empty | same | as L1 | yes | no | ✅ | — |

---

## 3. Backend endpoint extension list

These are the exact additions the backend must ship to close every gap above. No FE workaround is acceptable for any of these — until they ship the corresponding widget renders `<BackendPending>`.

### 3.1 `/dashboard/staff` — extend `summary` and add cash/bank split

```jsonc
{
  "summary": {
    "holder_count": 0,
    "holder_account_count": 0,
    "transaction_count": 0,
    "vault_count": 0,
    "pending_approvals": 0,
    "txns_today": 0,           // NEW — count(*) where posted_at::date = current_date
    "active_holders": 0,       // NEW — distinct holders posted in last 30d
    "bank_split_available": false, // NEW — true once vaults carry channel
    "user_count": 0,           // OPTIONAL — for admin tile
    "audit_count": 0           // OPTIONAL — for audit tile
  },
  "vault_balances_by_currency": [
    { "currency": "LYD", "cash_minor": 0, "bank_minor": 0 } // NEW: bank_minor
  ],
  "recent_transactions": [/* already includes holder_name, account_number, dahab_account_number */]
}
```

### 3.2 `/transactions` row shape (confirm on every list endpoint)

Each row in `/transactions`, `/transactions?limit=`, `/approvals/pending`, `/holders/:id/transactions`, `/holder-accounts/:id/ledger` must include:

```jsonc
{
  "id": "...",
  "tx_number": "TX-...",
  "amount_minor": 0,
  "currency_code": "LYD",
  "direction": "deposit|withdraw",
  "channel": "cash|bank",
  "status": "pending|posted|rejected|corrected",
  "posted_at": "ISO|null",
  "created_at": "ISO",
  "holder_name": "string|null",
  "account_number": "string|null",
  "dahab_account_number": "string|null"
}
```

### 3.3 `/reports/business/overview?days=30` (NEW or extend)

```jsonc
{
  "transaction_count": 0,
  "posted_count": 0,
  "rejected_count": 0,
  "holder_count": 0,
  "holder_account_count": 0,
  "avg_txn_value_lyd_minor": 0,
  "volume_by_currency_30d": [{ "currency": "LYD", "volume_minor": 0, "posted_count": 0 }],
  "daily_volume_7d":        [{ "day": "YYYY-MM-DD", "currency": "LYD", "volume_minor": 0, "tx_count": 0 }],
  "currency_distribution":  [{ "currency": "LYD", "balance_minor": 0 }],
  "customer_growth_7m":     [{ "month": "YYYY-MM", "new_holders": 0 }],
  "top_accounts_by_balance":[{ "account_id": "...", "name": "...", "currency": "LYD", "balance_minor": 0 }],
  "transaction_mix":        [{ "name": "deposit", "value_pct": 0, "count": 0 }]
}
```

### 3.4 `/reports/approval-speed?days=30` (NEW)

```jsonc
[{ "day": "YYYY-MM-DD", "median_seconds": 0, "approved_count": 0 }]
```

### 3.5 `/reports/tellers/today` (extend rows)

```jsonc
[{
  "id": "...",
  "name": "...",
  "branch": "string|null",
  "txns_today": 0,
  "volume_today_minor": 0,
  "avg_value_minor": 0,
  "accuracy_pct": 0,
  "avg_time_seconds": 0,
  "rank": 1,
  "trend": [0,0,0,0,0,0,0],
  "streak_days": 0
}]
```

### 3.6 `/reports/compliance/overview` (extend)

```jsonc
{
  "flagged_txns": 0,
  "pending_reviews": 0,
  "resolved_today": 0,
  "high_risk_holders": 0,
  "typology":     [{ "name": "Structuring", "value": 0 }],
  "alert_volume": [{ "d": "YYYY-MM-DD", "generated": 0, "resolved": 0 }],
  "kyc":               { "current_pct": 0, "target_pct": 0 },
  "aml":               { "current_pct": 0, "target_pct": 0 },
  "doc_verification":  { "current_pct": 0, "target_pct": 0 },
  "sanctions":         { "current_pct": 0, "target_pct": 0 }
}
```

### 3.7 `/reports/anomalies` (NEW — for Dashboard Anomaly Watchlist)

```jsonc
[{
  "id": "...",
  "kind": "structuring|velocity|jurisdiction|...",
  "severity": "low|med|high",
  "holder_name": "string|null",
  "account_number": "string|null",
  "amount_minor": 0,
  "currency_code": "LYD",
  "opened_at": "ISO",
  "reason": "string"
}]
```

### 3.8 Out of scope here (referenced for completeness)

- Portal namespace — `GET /portal/me`, `/portal/totals`, `/portal/accounts/:id/ledger` (still rendering `<BackendPending>`).
- Write endpoints — `POST /transactions`, `POST /transactions/:id/approve|reject|correct`, `POST /holders`, `POST /admin/fx-rates` (UI buttons remain disabled in lambda mode).
- `GET /admin/users`, `GET /admin/branches` page wiring.

---

## 4. Frontend mapping-only fixes (no backend change required)

These are safe to apply right now — the backend already returns the correct field, only the frontend reads the wrong source.

| # | File | Section | Current source | Correct source | Notes |
|---|---|---|---|---|---|
| F1 | `src/components/app/recent-transactions-table.tsx` (used by `app.index.tsx`) | Recent Transactions holder/account labels | Supabase join on `accounts` / `account_holders` | row fields `holder_name`, `account_number`, `dahab_account_number` from `/transactions` | Drop the Supabase enrichment in lambda mode. |
| F2 | `src/routes/app.index.tsx` `useDashData` lambda branch | Pinned Customers card | partly Supabase | `api.accounts.get(id)` + `api.holders.totals(holderId)` per pin | Already partly migrated — finish the switch. |
| F3 | `src/routes/app.reports.tsx` Cash Flow chart | Cash Flow series | `/reports/cash-flow` rows pivoted by `day` only | pivot by `day + currency_code + direction`; render one series per currency; never sum across currencies | Confirm in code review — current adapter returns the right rows. |
| F4 | `src/routes/app.reports.tsx` `useReportsData` lambda branch | Business KPIs (currently returns hard-coded zeros) | calls `/reports/liquidity-health` for nothing | once `/reports/business/overview` ships (§3.3), map straight through | Until then keep `<BackendPending>` for the affected widgets. |
| F5 | `src/routes/app.index.tsx` Network Pulse cash totals | reads `/dashboard/staff.vault_balances_by_currency[].cash_minor` | OK once backend exposes it; today falls back to `/vaults` rows tagged `vault_channel="cash"` heuristically | Remove heuristic once `bank_split_available=true`. |

---

## 5. Widgets that must remain `<BackendPending>` until backend ships

Render `<BackendPending endpoint="..." />` for the individual widget — never the whole page, never `0`, never mock data.

- Dashboard **Network Pulse — bank totals** until `vault_balances_by_currency[].bank_minor` ships (§3.1).
- Dashboard **Txns Today** until `summary.txns_today` ships (§3.1).
- Dashboard **Active Holders** until `summary.active_holders` ships (§3.1).
- Dashboard **Anomaly Watchlist** until `/reports/anomalies` ships (§3.7).
- Reports **Business KPI strip / Daily Transactions / Balance by Currency / Customer Growth / Top Accounts / Transaction Mix** until `/reports/business/overview` ships (§3.3).
- Reports **Approval Speed** until `/reports/approval-speed` ships (§3.4).
- Reports **Top Performers + Full Teller table + Volume by Teller** rows that lack any of the per-row fields in §3.5 (P2 fields `trend`, `streak_days`, `accuracy_pct` may render `—` per cell while the row otherwise displays).
- Reports **Compliance KPI strip / Health gauges / Alert Volume / Risk Typology** until `/reports/compliance/overview` is extended (§3.6).
- `/app/vaults` **Consolidated Reserves** card until `/reports/liquidity-health.network_total_lyd_minor` is rendered there.

---

## 6. Priority summary

- **P0** — Dashboard #6 (txns_today), #8 (cash split heuristic), #9 (bank totals always 0).
- **P1** — Dashboard #7 (active_holders), #11 (RecentTransactionsTable Supabase lookup), #14 (anomalies), #15 (PinnedCustomers Supabase); Reports B1–B7, T1–T3, C1, C3, C4.
- **P2** — Cash-flow pivot confirmation (F3), Liquidity FX-missing CTA, Tellers `trend`/`streak_days`/`accuracy_pct`, Compliance gauges (C2).

No P0/P1 item above is allowed to render `0` or fabricated data; until the backend extension ships the widget must render `<BackendPending>`.