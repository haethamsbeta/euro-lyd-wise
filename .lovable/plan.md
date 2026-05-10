
# Dashboard & Reports — Backend Metrics Gap Audit

Create a new document `docs/DASHBOARD_REPORTS_BACKEND_METRICS_GAP.md` that catalogs every card, chart and table on `/app` (Dashboard) and `/app/reports` against the real Lambda endpoints, and lists exactly what is missing on the backend versus what is only a frontend mapping fix.

No UI/redesign work, no code changes to routes in this pass. The deliverable is the audit doc itself.

## Document structure

1. **Source-of-truth rules** (1-paragraph recap)
   - Dashboard totals: `/dashboard/staff` only.
   - Vault balances: `/vaults` only.
   - Recent transactions list: `/transactions` (never used for totals).
   - Liquidity / FX: `/reports/liquidity-health` only — no FE FX math.
   - Reports widgets: only the `/reports/*` family.
   - Lambda mode: zero Supabase fallback. Missing data → `<BackendPending>` for that widget only, never the whole page.

2. **Dashboard `/app` audit table**
   Columns: UI section · FE field expected · Current endpoint · Backend fields returned today · Missing backend fields · Correct endpoint · Required response shape · FE-mapping-only? · Backend extension required? · Priority.
   Rows to cover (one per visible card/section in `app.index.tsx`):
   - KPI strip: Holders / Linked accounts / Transactions / Vaults
   - Pending Approvals badge
   - Txns Today tile
   - Active Holders tile
   - Network Pulse — cash totals per currency
   - Network Pulse — bank totals per currency (currently always 0)
   - Recent Transactions table (holder_name, account_number, dahab_account_number)
   - Urgent Approvals
   - Recent Audit Events
   - Anomaly Watchlist
   - Pinned Customers
   - Liquidity / FX health card

3. **Reports `/app/reports` audit table**
   Same columns. One row per widget grouped by lens:
   - **Business lens**: volume_by_currency_30d, daily_volume_7d, currency_distribution, customer_growth_7m, top_accounts_by_balance, transaction counts, holder/account counts, avg txn value, rejection rate, txn mix (deposits/withdrawals/transfers), approval trend.
   - **Cash flow**: confirm pivot by `day + currency_code + direction`; never sum across currencies.
   - **Hourly traffic**: per-hour buckets.
   - **Processing time distribution**: bucket counts.
   - **Rejection rate trend**: daily series.
   - **Approval speed**: median seconds per day.
   - **Tellers today**: name, branch, txns_today, volume_today_minor, avg_value_minor, accuracy_pct, avg_time_seconds, rank, trend, streak_days.
   - **Compliance overview**: flagged_txns, pending_reviews, resolved_today, high_risk_holders; KYC/AML/doc-verification/sanctions current+target percentages; alert_volume series; risk typology pie.
   - **Liquidity health**: per-currency balance, days_of_cover, health, network_total_lyd_minor, missing_rates.

4. **Backend endpoint extension list** (consolidated)
   Exact endpoint + exact JSON shape needed for each gap. Known items to include:
   - `/dashboard/staff` summary additions: `txns_today`, `active_holders`, `cash_by_currency[]`, `bank_by_currency[]`, `bank_split_available`, optional `user_count`, `audit_count`.
   - `/transactions` row additions already-confirmed: `holder_name`, `account_number`, `dahab_account_number` on every row.
   - `/reports/business/overview` — define expected shape (volume_by_currency_30d, daily_volume_7d, currency_distribution, customer_growth_7m, top_accounts, counts).
   - `/reports/tellers/today` — full row shape above.
   - `/reports/compliance/overview` — full shape above incl. KYC/AML/doc/sanctions targets.
   - `/reports/anomalies` — for Dashboard Anomaly Watchlist.
   - Portal namespace (out of scope for this gap doc but listed).
   - Write endpoints (deposit/withdraw/approve/reject/correct) — listed as still pending, not in scope here.

5. **Frontend mapping-only fixes list**
   Items where backend already returns the right field and only the FE read needs to be corrected. Examples:
   - Dashboard Recent Transactions table: stop Supabase holder lookup, read `holder_name` / `account_number` / `dahab_account_number` from row.
   - Reports cash-flow: confirm pivot by `day + currency_code + direction`; ensure no cross-currency sum.
   - Reports business overview: when `/reports/business/overview` returns the documented shape, replace current Supabase-backed `useReportsData` lambda branch (which currently returns zeros) with direct mapping.

6. **BackendPending list**
   Widgets that must keep rendering `<BackendPending>` until backend ships the field — never fake values, never hide the section. Examples:
   - Network Pulse bank-side tile until `bank_by_currency` exists.
   - Anomaly Watchlist until `/reports/anomalies` exists.
   - Compliance KYC/AML/doc/sanctions gauges until targets exposed.
   - Tellers leaderboard rows for any teller missing trend/streak/accuracy.
   - Consolidated Reserves card on `/app/vaults` until `/reports/liquidity-health.network_total_lyd_minor` is wired.

7. **Priority summary**
   - **P0**: wrong totals / wrong balances on Dashboard cards (bank split heuristic, txns_today derived from loaded list).
   - **P1**: report widgets with empty/zero values in lambda mode (business overview, tellers, compliance gauges, anomaly feed).
   - **P2**: nice-to-have report polish (streak_days, trend sparklines, target percentages).

## Out of scope
- No edits to `app.index.tsx`, `app.reports.tsx`, adapters, or any other source file in this pass.
- No UI redesign. No section removal. No mock data. No FE FX math.
- Write endpoints and portal namespace are referenced only for completeness.

## Deliverable
Single new file: `docs/DASHBOARD_REPORTS_BACKEND_METRICS_GAP.md` containing the four required tables, the endpoint extension list, the FE-mapping-only list, and the BackendPending list.
