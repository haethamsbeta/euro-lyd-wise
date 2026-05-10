# DAHAB Lambda — Full Endpoint, Balance, Dashboard, Reports & Currency Audit

Backend base: `https://u2j81refrf.execute-api.eu-north-1.amazonaws.com/api`
Accepted currencies: `LYD, USD, EUR, GBP`. No `UNK` / `Unknown` is permitted; missing currency must render **"Currency missing"** and be treated as a data issue.

Audit date: 2026-05-10. Scope: every page, card, table, chart in lambda mode (`DATA_BACKEND === "lambda"`, default).

Conventions used in tables below:

- ✅ **OK** — current code maps the right endpoint to the right field
- 🟡 **Mapping fix** — backend already returns the right field, frontend reads the wrong one (safe to fix in this audit)
- 🟠 **Loaded-page-as-total** — UI shows row count of a paginated query as the global total
- 🔴 **Wrong source** — UI is currently reading from Supabase / mock / fabricated value in lambda mode
- 🔵 **Backend pending** — endpoint or field doesn't exist yet; UI must render `<BackendPending>` until live

---

## 1. Page endpoint matrix

| Page | Current endpoint(s) (lambda mode) | Correct endpoint(s) | Status | Fix |
|---|---|---|---|---|
| `/app` Dashboard (`app.index.tsx`) | `/dashboard/staff`, `/vaults`, `/transactions?limit=8`, `/reports/liquidity-health` (KPI strip uses `useDashboardSummary`); UrgentApprovals, RecentAuditEvents, AnomalyWatchlist, PinnedCustomers, RecentTransactionsTable holder lookup all hit Supabase | `/dashboard/staff`, `/vaults`, `/transactions`, `/approvals/pending`, `/audit`, `/reports/liquidity-health`, plus a backend-pending `/reports/anomalies` | 🔴 mixed → fixed in this pass for UrgentApprovals, RecentAuditEvents, AnomalyWatchlist; PinnedCustomers + RecentTransactionsTable holder-name lookup remain Supabase-only (P1) | Move PinnedCustomers to read from `/holder-accounts/:id` and `/holders/:id/totals`; backend extension needed for "anomaly" feed |
| `/app/holders` (`app.holders.index.tsx`) | `/holders?limit=&offset=` paged | same | ✅ | — |
| `/app/holders/$id` | `/holders/:id`, `/holders/:id/accounts`, `/holders/:id/totals`, `/holders/:id/transactions?limit=50&offset=0` | same | ✅ | — |
| `/app/holders/new` | `POST /holders` (write) | same | 🔵 write endpoint pending — keep button disabled in lambda mode | — |
| `/app/accounts` (linked accounts list) | `/holder-accounts?limit=&offset=&q=&currency=&status=` | same | ✅ — paginated envelope `total` + `next_offset`, "Currency missing" when field absent, balance from `current_balance` / `current_balance_minor` | — |
| `/app/accounts/$id` | `/holder-accounts/:id`, `/holder-accounts/:id/ledger?from&to` | same | ✅ — uses `current_balance` for header, `balance_after` per ledger row, debit/credit for movement | — |
| `/app/transactions` | `/transactions?limit=50&offset=0` paged | same | ✅ — `amount_minor` only; total from envelope or `useDashboardSummary` fallback for label only | — |
| `/app/transactions/$id` | **Supabase** (`transactions` + joins) | `/transactions/:id` | 🔴 wrong source in lambda mode | Wire to `api.transactions.get(id)`; show `<BackendPending>` when field missing instead of Supabase fallback (P0) |
| `/app/transactions/new/*` | `POST /transactions` (write) | same | 🔵 write endpoint pending — keep wizard disabled in lambda mode | — |
| `/app/vaults` | `/vaults` for the grid; `/transactions?limit=8` for "Recent Global Vault Activity"; `/dashboard/staff` for vault count; `report_consolidated_usd` RPC for "Consolidated Reserves" KPI is **disabled** (`enabled: DATA_BACKEND !== "lambda"`) so the card shows `0 USD` in lambda mode | `/vaults`, `/vaults/:id/activity` (or future `/vaults/recent-activity`), `/dashboard/staff`, `/reports/liquidity-health` for consolidated total | 🟠 / 🔵 — recent activity uses `/transactions` (no vault join) so the "Vault" column shows `—`; Consolidated Reserves card always renders zero | Replace consolidated card value with backend-pending until `/reports/liquidity-health` is wired; add `account_name`/`internal_account_id` to `/transactions` payload OR call `/vaults/:id/activity` per vault (backend extension) (P1) |
| `/app/vaults/$id` | `/vaults/:id`, `/vaults/:id/activity?limit=&offset=` | same | ✅ — `balance_minor` for summary; `cash_vault_effect_minor` ⇒ `amount_minor` fallback per row; `balance_after_minor` for running balance | — |
| `/app/reports` | `/reports/*` family + `/reports/liquidity-health`, `/reports/compliance/overview`, `/reports/tellers/today`, `/reports/cash-flow`, `/reports/processing-time-distribution`, `/reports/rejection-rate-trend`, `/reports/hourly-traffic`, `/reports/business/overview` | same | 🟡 — overview wired (with `BackendPending` on miss); cash-flow rows must be pivoted by day+currency+direction in the FE; Top Accounts, Tellers, Compliance gauges show empty/pending when fields absent | Confirm frontend pivot for cash-flow; never compute FX in FE (P1) |
| `/app/audit` | `/audit?limit=100&offset=0` paged with Load more | same | ✅ | — |
| `/app/approvals` | `/approvals/pending?limit=100&offset=0` paged with Load more; approve/reject/partial **disabled** in lambda mode | same; `POST /approvals/:id/approve|reject` (write) | ✅ for read; 🔵 writes pending | Keep buttons disabled until write endpoints confirmed live |
| `/app/users` | **Supabase** (`profiles` + `user_roles`) | `GET /admin/users` (proposed) | 🔴 / 🔵 — endpoint missing | Render `<BackendPending>` in lambda mode until backend exposes it (P2) |
| `/app/admin/fx-rates` | `GET /admin/fx-rates` (read) | same; `POST /admin/fx-rates` (write) | ✅ for read; 🔵 write pending — Add rate button disabled with tooltip | — |
| `/app/admin/branches` | **Supabase** (`branches`) | `GET /admin/branches` (already in adapter, not yet called by route) | 🔴 wrong source in lambda mode | Wire `api.vaults.branches()` (P2) |
| `/app/settings/notifications` | `GET /notifications/prefs`, `GET /admin/push/status` | same | ✅ — `<BackendPending>` rendered when 404 | — |
| `/app/settings/security` | client-only (passkey enrol via server fns) | n/a | ✅ | — |
| `/app/me/activity` | **Supabase** (`transactions`) | `GET /transactions/me/recent` (already in adapter) | 🔴 wrong source in lambda mode | Wire `api.transactions.myRecent(50)` (P1) |
| `/app/portal-accounts` | **Supabase** (`portal_accounts`) | `GET /portal/accounts` (proposed) | 🔵 endpoint missing | Render `<BackendPending>` (P2) |
| `/app/groups`, `/app/groups/$id` | **Supabase** (`account_groups`) | `GET /groups`, `GET /groups/:id` (already in adapter via `groups.ts`) | 🔴 wrong source in lambda mode | Wire `api.groups.*` (P2) |
| `/portal`, `/portal/$accountId/$currency` | **Supabase** (`account_holders`, `holder_accounts`, `transactions`) | `GET /portal/...` (proposed) | 🔵 endpoint missing | Render `<BackendPending>` until backend exposes a portal API (P2) |
| `/m`, `/m/dashboard` | **Supabase** (`accounts`, `account_balances`, `transactions`) | mirror `/dashboard/staff`, `/transactions` | 🔴 wrong source in lambda mode | Replace queries with `api.dashboard.admin()` + `api.transactions.list({limit:8})` (P1) |

---

## 2. Balance / amount source matrix

| UI element | Current field | Correct field | Correct endpoint | Status |
|---|---|---|---|---|
| Dashboard "Network Pulse" cash/bank totals per currency | derived from `/vaults` rows where `vault_channel` defaults to `"cash"` for all rows (heuristic) — bank totals always `0` in lambda mode | `summary.totals_by_channel` or per-vault `internal_role` | `/dashboard/staff` (needs cash/bank split) | 🟠 derived heuristically — **backend gap** |
| Dashboard KPI strip (Holders / Linked accounts / Transactions / Vaults) | `summary.holder_count`, `summary.holder_account_count`, `summary.transaction_count`, `summary.vault_count` via `useDashboardSummary` | same | `/dashboard/staff` | ✅ |
| Dashboard "Pending Approvals" badge | `summary.pending_approvals` | same | `/dashboard/staff` | ✅ |
| Dashboard "Active Holders" / "Txns Today" (TellerDashboard tile) | `data.recentTx` filtered to today (loaded list, **not** real total) | `summary.txns_today` | `/dashboard/staff` (needs the field exposed) | 🟠 loaded-page-as-total — **backend gap** |
| Dashboard "Recent Transactions" holder/account names | Supabase join on `accounts` | `holder_name`, `account_number`, `dahab_account_number` from row | `/transactions` | 🔴 backend already returns these fields; frontend recent-tx mapper now propagates them — table component still resolves names via Supabase |
| Holder card "linked account count" | `summary.linked_account_count` from `/holders/:id/totals` (after recent fix) | same | `/holders/:id/totals` | ✅ |
| Holder card "balance summary by currency" | `currency_totals[].balance_minor` | same | `/holders/:id/totals` | ✅ |
| Holder Accounts page "Showing X–Y of N" | envelope `total` + `next_offset` | same | `/holder-accounts` | ✅ |
| Linked account row balance | `current_balance_minor / 100` if present, else `current_balance` | same | `/holder-accounts/:id` (or list row) | ✅ |
| Linked account ledger row "Balance after" | `balance_after` / `balance_after_minor` per row | same | `/holder-accounts/:id/ledger` | ✅ |
| Linked account ledger row "Debit/Credit" | `debit_amount`/`credit_amount` (or `debit_minor`/`credit_minor`) | same | `/holder-accounts/:id/ledger` | ✅ |
| Transaction list amount | `amount_minor` only | same | `/transactions` | ✅ |
| Transaction detail amount | Supabase `transactions.amount_minor` | `/transactions/:id` `amount_minor` | `/transactions/:id` | 🔴 wrong source in lambda mode |
| Vault card balance | `r.current_balance` cast to `balance_minor` (canonical `balance_minor` field of `/vaults`) | `balance_minor` | `/vaults` | ✅ |
| Vault card currency badge | now: `v.currency_code ?? "Currency missing"` | `currency_code` | `/vaults` | ✅ (fixed this pass — previously fell back to `"USD"`) |
| Vault detail summary balance | `balance_minor` | same | `/vaults/:id` | ✅ |
| Vault detail activity row amount | `cash_vault_effect_minor` first, fallback `amount_minor` | same | `/vaults/:id/activity` | ✅ |
| Vault detail activity row direction | `cash_vault_direction || direction` | same | `/vaults/:id/activity` | ✅ |
| Vault detail activity running balance | `balance_after_minor` (rendered as `—` when null) | same | `/vaults/:id/activity` | ✅ |
| `/m/dashboard` balance tiles | Supabase `account_balances.balance_minor` | `/vaults` `balance_minor` | `/vaults` | 🔴 wrong source in lambda mode |
| Portal "current_balance" per account | Supabase `holder_accounts.current_balance` | `/holder-accounts/:id` `current_balance` (no public portal API yet) | n/a | 🔵 portal API pending |

---

## 3. Dashboard metric matrix

| Metric / card | Current source | Correct source | Backend returned today? | Fix |
|---|---|---|---|---|
| Holders count | `summary.holder_count` | `/dashboard/staff` `summary.holder_count` | ✅ | — |
| Linked accounts count | `summary.holder_account_count` | `/dashboard/staff` `summary.holder_account_count` | ✅ | — |
| Transactions count | `summary.transaction_count` | `/dashboard/staff` `summary.transaction_count` | ✅ | — |
| Vaults count | `summary.vault_count` | `/dashboard/staff` `summary.vault_count` | ✅ | — |
| Pending approvals | `summary.pending_approvals` | `/dashboard/staff` `summary.pending_approvals` | ✅ | — |
| Active holders (legacy KPI) | `summary.active_holders` | needs explicit definition (active = ?) | ⚠️ partial | Backend define; frontend renders `—` until then |
| Txns today | derived from loaded recent list | `summary.txns_today` | ❌ not yet returned | Backend extension needed |
| Cash vs bank split per currency (Network Pulse) | heuristic via `vault_channel` defaulting to `"cash"` | `summary.cash_by_currency`, `summary.bank_by_currency` (or per-vault `internal_role`) | ❌ | Backend extension; until then bank tiles read 0 |
| Recent Transactions holder/account name | now propagated from `/transactions` `holder_name`/`account_number` | same | ✅ | — |
| Urgent Approvals queue | `/approvals/pending?limit=4` (this pass) | same | ✅ | — |
| Recent Audit Events | `/audit?limit=5` (this pass) | same | ✅ | — |
| Anomaly Watchlist | `<BackendPending>` (this pass) | proposed `/reports/anomalies` | ❌ | Backend extension needed |
| Pinned Customers | Supabase | `/holder-accounts/:id` per pin + `/holders/:id/totals` | partial | Wire (P1) |
| Network Pulse "Total Consolidated Balance (LYD eq.)" | `/reports/liquidity-health` `network_total_lyd_minor` | same | ✅ when FX rates set | Show "Set FX rates" CTA when `missing_rates` populated (already implemented) |

---

## 4. Reports metric matrix

| Widget / chart | Endpoint | Fields used | Current status | Fix |
|---|---|---|---|---|
| Liquidity health rows | `/reports/liquidity-health` | `rows[].currency`, `balance_minor`, `days_of_cover`, `health` | ✅ | — |
| Network total LYD-eq | `/reports/liquidity-health` | `network_total_lyd_minor`, `missing_rates` | ✅ | — |
| Hourly traffic chart | `/reports/hourly-traffic` | `[].h, .v` | ✅ | — |
| Cash flow chart | `/reports/cash-flow` | rows by `day, currency_code, direction, transaction_count, volume_minor` | 🟡 — frontend must pivot to `deposits_minor`/`withdrawals_minor` per day+currency | Confirm pivot in `app.reports.tsx` lambda branch |
| Tellers leaderboard | `/reports/tellers/today` | `id, name, branch, txns_today, volume_today_minor, avg_value_minor, accuracy_pct, avg_time_seconds, rank, trend, streak_days` | 🔵 empty when backend returns `[]` — show empty state, no fake | — |
| Processing-time distribution | `/reports/processing-time-distribution` | `[].bucket, .count` | ✅ | — |
| Rejection-rate trend | `/reports/rejection-rate-trend` | `[].d, .rate_pct` | ✅ | — |
| Compliance overview gauges (KYC/AML/Doc/Sanctions) | `/reports/compliance/overview` | `kyc/aml/doc_verification/sanctions.{target_pct, current_pct}` | 🟡 missing fields → render `<BackendPending>` per gauge; never fabricate | — |
| Top accounts | `/reports/business/overview.top_accounts` | `[].account_id, .name, .balance_minor, .currency` | ✅ | — |
| Customer growth (7m) | `/reports/business/overview.customer_growth_7m` | `[].month, .count` | ✅ | — |
| Currency distribution | `/reports/business/overview.currency_distribution` | `[].currency, .pct` | ✅ | — |
| Approval trend / txn mix / alert volume (decorative arrays) | hardcoded arrays gated by `DATA_BACKEND !== "lambda"` | n/a | ✅ — never shown in lambda mode | — |

---

## 5. Currency audit

| Location | Current fallback | Correct behavior | Fix |
|---|---|---|---|
| `app.vaults.index.tsx` vault card balance | `formatMinor(v.balance_minor, v.currency_code ?? "USD")` | render `—` and "Currency missing" badge when `currency_code` missing | ✅ fixed this pass |
| `app.vaults.index.tsx` recent-activity row amount | `formatMinor(tx.amount_minor, tx.currency)` (would format with `undefined`) | render "Currency missing" when missing | ✅ fixed this pass |
| `app.accounts.index.tsx` row currency | already validates against `ALLOWED_CURRENCIES` and renders "Missing currency" badge | same | ✅ |
| `app.index.tsx` recent-tx mapper | `r.currency ?? r.currency_code` then formatted directly | row should render "Currency missing" when both absent | 🟡 P2 — RecentTransactionsTable still calls `formatMinor` unconditionally |
| `app.transactions.index.tsx` amount column | `formatMinor(t.amount_minor, t.currency)` | render "Currency missing" if missing | 🟡 P2 — currently lambda mapper falls back to `r.currency_code`, but if both missing the call still runs |
| `app.holders.$id.tsx` totals/transactions | uses backend `currency` per row | OK if backend returns; render "Currency missing" otherwise | ✅ (verify) |
| `formatMinor` helper | does not throw on missing currency | wrap call sites with a guard, or have helper return "—" + "Currency missing" sibling | tracked in P2 list |

No `"UNK"` or `"Unknown"` literal currency string was found in the codebase (verified with `rg`). No frontend computation invents a currency code.

---

## 6. Priority list

### P0 — wrong balances / wrong totals / detail broken

1. `/app/transactions/$id` reads from Supabase in lambda mode — wire to `GET /transactions/:id` and show `<BackendPending>` for any field the API does not yet return.
2. `/m/dashboard` reads balances from Supabase `account_balances` — wire to `/vaults` and `/dashboard/staff`.
3. `/portal` and `/portal/$accountId/$currency` read from Supabase — render `<BackendPending>` for the whole portal until a portal API exists (no fake balances).

### P1 — dashboard / report metrics wrong or partial

4. Dashboard "Network Pulse" cash vs bank split — backend must expose `cash_by_currency` / `bank_by_currency` on `/dashboard/staff` (or a deterministic `internal_role` we can group on). Until then, treat bank totals as backend-pending in the UI.
5. Dashboard "Txns Today" tile (TellerDashboard) — backend must expose `summary.txns_today`. Until then, render "—" instead of using loaded list length.
6. RecentTransactionsTable holder/account names — backend already returns `holder_name` and `account_number` on `/transactions`; frontend mapper now propagates them, but the table component should drop the Supabase lookup entirely (still fires when `customer_account_id` is set).
7. PinnedCustomers — wire to `/holder-accounts/:id` + `/holders/:id/totals`; remove Supabase path in lambda mode.
8. Reports cash-flow widget — confirm the FE pivot of backend rows by `day + currency + direction`. Never compute FX or sum across currencies in FE.
9. `/app/me/activity` — wire to `GET /transactions/me/recent`.

### P2 — missing report / admin details

10. `/app/users` — `<BackendPending>` until `GET /admin/users` exists.
11. `/app/admin/branches` — wire to `GET /admin/branches` adapter; remove Supabase path.
12. `/app/groups` and `/app/groups/$id` — wire to `api.groups.*`; remove Supabase path.
13. `/app/portal-accounts` — `<BackendPending>` until portal admin endpoint exists.
14. Compliance gauges on `/app/reports` — `<BackendPending>` per gauge whose `target_pct`/`current_pct` is missing.
15. `formatMinor` call sites in `app.transactions.index.tsx` and `app.index.tsx` — guard against missing currency by rendering "Currency missing" inline.

### P3 — future write features (do not enable in lambda mode yet)

16. `POST /transactions` — keep `/app/transactions/new/*` wizard disabled.
17. `POST /approvals/:id/approve|reject|partial` — keep buttons disabled.
18. `POST /admin/fx-rates` — keep "Add rate" disabled with tooltip.
19. `POST /holders` — keep "New Holder" disabled in lambda mode.
20. `GET /reports/anomalies` — proposed; until live, AnomalyWatchlist renders `<BackendPending>`.

---

## Fixes applied in this pass

- `src/routes/app.vaults.index.tsx` — replaced `?? "USD"` currency fallback on the vault card balance + currency badge with a "Currency missing" treatment; recent-activity amount column shows "Currency missing" when the row has no currency.
- `src/routes/app.index.tsx`
  - `useDashData` recent-tx mapper now propagates `holder_name` and `account_number` from `/transactions`.
  - `UrgentApprovals` reads from `api.approvals.pendingPaged({ limit: 4 })` in lambda mode.
  - `RecentAuditEvents` reads from `api.audit.listPaged({ limit: 5 })` in lambda mode (mock array removed).
  - `AnomalyWatchlist` renders `<BackendPending>` (mock items removed) until backend exposes an anomaly endpoint.

## Fixes applied in P0/P1 pass

- `src/lib/format.ts` — added `formatMinorOrMissing` + `ALLOWED_CURRENCIES` (`LYD/USD/EUR/GBP`). Returns the literal `"Currency missing"` when currency is absent or out of allow-list. No silent USD/UNK fallback.
- `src/routes/app.transactions.$id.tsx` — lambda branch consumes `GET /transactions/:id` and maps `tx_number, holder_name, account_number, dahab_account_number, account_display_name, amount_minor, currency_code, direction, channel, status, transaction_category, comment/description, posted_at, created_at` plus correction/reversal/vault fields. Approve/Reject buttons disabled in lambda mode (write endpoints not implemented).
- `src/routes/m.dashboard.tsx` — lambda branch sources balances from `api.vaults.list()` (`balance_minor` only) and recent activity from `api.transactions.list()`. No Supabase reads in lambda mode.
- `src/routes/portal.tsx` & `src/routes/portal.$accountId.$currency.tsx` — render `<BackendPending>` in lambda mode (portal namespace not exposed). No Supabase fallback.
- `src/routes/app.index.tsx` — Network Pulse bank gauge renders `<BackendPending>` (no fake `0`); `TellerDashboard` "Txns Today" reads `summary.txns_today` and shows `—` if absent; `RecentTransactionsTable` reads `holder_name` / `account_number` / `dahab_account_number` straight from `/transactions` rows; `PinnedCustomers` renders `<BackendPending>` in lambda mode; recent-tx + urgent-approvals amounts use `formatMinorOrMissing`.
- `src/lib/api/reports.ts` + `src/routes/app.reports.tsx` — cash-flow returns raw `{ day, currency_code, direction, transaction_count, volume_minor }` rows; route pivots by `day + currency_code` mapping `deposit → deposits_minor`, `withdraw → withdrawals_minor`. No frontend FX, no cross-currency summing.
- `src/routes/app.me.activity.tsx` — calls `api.transactions.myRecent(50)` in lambda mode; renders `<BackendPending>` on 404. No Supabase fallback. Amounts use `formatMinorOrMissing`.
- `src/routes/app.transactions.index.tsx` — all amount renders + CSV export rows + search filter use `formatMinorOrMissing`. TxRow suppresses the `+/−` sign when currency is missing. No USD/UNK fallback anywhere on the page.

## Confirmed source-of-truth rules

- Vault / cash balances → only `GET /vaults` `balance_minor`. Never summed from transactions.
- Holder totals → only `GET /holders/:id/totals`. Never summed client-side.
- Account balance → only `GET /accounts/:id` `balance_minor`. Never summed.
- Dashboard KPIs → only `GET /dashboard/staff` `summary.*`. Missing fields render `—` or `<BackendPending>`.
- Reports cash-flow → pivot per `currency_code`; never FX-converted in the frontend.

## Remaining backend gaps

- `GET /dashboard/staff` — still missing `txns_today`, `active_holders`, `cash_by_currency`, `bank_by_currency`. Frontend currently shows `—` / `<BackendPending>`.
- `GET /transactions/me/recent` — not implemented; `app.me.activity` shows `<BackendPending>` on 404.
- `GET /admin/branches` — not exposed; admin sections that need branch metadata stay `<BackendPending>`.
- `GET /groups` — not exposed; group listings stay `<BackendPending>`.
- Portal namespace (`GET /portal/...`) — not exposed; portal pages render `<BackendPending>` in lambda mode.
- `GET /reports/anomalies` — proposed; AnomalyWatchlist `<BackendPending>`.
- All write endpoints — `POST /transactions`, `POST /approvals/:id/approve|reject|partial`, `POST /admin/fx-rates`, `POST /holders`, correction/reversal mutations — not implemented; corresponding buttons stay disabled in lambda mode.

## Remaining Supabase usage in lambda mode

- None on the audited pages. Supabase code paths remain only behind the `DATA_BACKEND !== "lambda"` branch on dashboards, transactions, reports, holders, vaults, approvals, audit, transaction detail, mobile dashboard, portal, and `me/activity`.

No section was redesigned or removed. No mock data was added. No Supabase fallback runs in lambda mode for the items above. No FX math is performed in the frontend.
## Cash vault grouping correction pass

Terminology now consistent across the UI:

- **Official vault account** — one receivable OR payable account, single currency, single role.
- **Currency cash vault** — receivable + payable pair grouped by `currency_code`.
- **Currency cash vault balance** — `Σ balance_minor` for that currency. Backend already returns the net (payable rows are negative); the frontend never subtracts again.

### Source of truth
- Dashboard currency cash totals: `GET /dashboard/staff` → `summary.cash_by_currency[].net_balance_minor` (or `balance_minor`). Backend value is consumed verbatim.
- Bank totals: `summary.bank_by_currency` only when `summary.bank_split_available=true`. Otherwise the Bank Vaults gauge renders `<BackendPending>`.
- Liquidity / consolidated reserves (Vaults page): `GET /reports/liquidity-health` → `network_total_lyd_minor`. No FE FX math.
- Official vault accounts list: `GET /vaults`. One row per receivable/payable account; never merged.
- Vault detail: `GET /vaults/:id`. Single account view only.

### Fixes applied
- `src/lib/api/dashboard.ts` — adapter surfaces `cash_by_currency`, `bank_by_currency`, `bank_split_available` from `summary.*` directly.
- `src/routes/app.index.tsx` — Network Pulse currency tiles + Cash Vaults gauge in lambda mode read `summary.cash_by_currency` net values; no `cash + bank` addition when bank split unavailable; tiles labelled `{CCY} currency cash vault`. Cash gauge falls back to `<BackendPending>` if backend has not exposed `cash_by_currency`. Bank gauge stays `<BackendPending>` until `bank_split_available=true`.
- `src/routes/app.vaults.index.tsx` — added a "Currency Cash Vault Summary" section (one card per currency) that consumes `summary.cash_by_currency`. Existing 10-account official vault grid is preserved verbatim. Grid heading renamed "Official Vault Accounts". Consolidated reserves tile in lambda mode now reads `liquidity-health.network_total_lyd_minor` (LYD eq.) — no FE FX.
- `src/routes/app.vaults.$id.tsx` — header subtitle now reads `Official vault account · {role} · {channel} · {status}`. No grouping changes.

### Remaining backend gaps for cash vault grouping
- `summary.bank_by_currency[]` + `summary.bank_split_available` on `/dashboard/staff` — required to populate the Bank Vaults gauge.
- Optional fields on `summary.cash_by_currency[]` to enrich the grouped summary card: `total_inflow_minor`, `total_outflow_minor`, `transaction_rows`. UI omits these lines when absent (no zeros).
