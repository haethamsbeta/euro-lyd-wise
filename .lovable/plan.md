## Goal

Wire every widget on `/app/reports` to the real Lambda report endpoints. In lambda mode the page must contain zero static demo arrays, zero Supabase queries, zero frontend FX math, and zero fabricated percentages/counts. Where a field or whole endpoint is not yet returned by the backend, render `BackendPending` for that specific card. Design, layout, and section list are unchanged.

## Endpoint inventory & coverage

| # | Section | Widgets | Endpoint | Action |
|---|---|---|---|---|
| 1 | Business Overview | KPI strip, Daily Transactions, Balance by Currency, Customer Growth, Top Accounts | `GET /reports/business/overview` | New adapter; replace Supabase hook |
| 2 | Cash Flow | Inflow/Outflow area chart | `GET /reports/cash-flow` | Pivot by day+currency_code+direction; LYD-only chart with explicit currency badge |
| 3 | Liquidity Health | Vault grid | `GET /reports/liquidity-health` | Fix field names (`currency_code`, `vault_name`, `minimum_threshold_breach`); derive health locally |
| 4 | Tellers | KPI strip, Podium, Leaderboard table, Volume by Teller | `GET /reports/tellers/today` | Drop hardcoded `24/63/99.1%/2.5min` fallback values |
| 5 | Compliance | KPI strip, KYC/AML/Doc/Sanctions gauges, Alert Volume, Risk Typology | `GET /reports/compliance/overview` | Map `alert_volume_daily`→`alert_volume`, `risk_typology`→`typology`; per-gauge null → BackendPending |
| 6 | Processing Time Distribution | Bar chart | `GET /reports/processing-time-distribution` | Empty → BackendPending |
| 7 | Rejection Rate Trend | Line chart | `GET /reports/rejection-rate-trend` | Empty → BackendPending |
| 8 | Hourly Traffic | Peak Hours bar chart | `GET /reports/hourly-traffic` | Derive "Peak Hour" from data; empty → BackendPending |
| — | Approval Speed | Card body | (no endpoint) | BackendPending — no `/reports/approval-speed` |
| — | Transaction Mix | Pie | (no endpoint) | BackendPending |

## File changes

### `src/lib/api/reports.ts`

1. **New** `businessOverview()` adapter:
   - `GET /reports/business/overview` → `{ counts, volume_by_currency_30d, daily_volume_7d, currency_distribution, customer_growth_7m, top_accounts }`. Coerce stringified numbers; map any `currency_code` to `currency` while preserving the original code. Tolerate missing fields by returning `null` for absent keys (UI gates per-widget).
2. **Update** `LiquidityHealthRow` to real backend shape:
   `vault_account_id, vault_name, currency_code, balance_minor, target_minor, min_minor, minimum_threshold_breach, days_of_cover`. Drop `health` (UI derives). Keep `network_total_lyd_minor` & `missing_rates` nullable on the response wrapper.
3. **Update** `ComplianceOverview`:
   - Map backend `alert_volume_daily → alert_volume` and `risk_typology → typology` in the adapter.
   - Each gauge (`kyc`, `aml`, `doc_verification`, `sanctions`) typed as `{ target_pct: number; current_pct: number } | null`. Adapter returns `null` when either pct is null/missing.
4. **New** helper `displayCurrency(code: string|null|undefined): { code: string, valid: boolean }`:
   - Accepted set `["LYD","USD","EUR","GBP"]`. When invalid/missing returns `{ code: "Currency missing", valid: false }`. UI uses `valid:false` to skip rendering currency-specific formatting.

### `src/routes/app.reports.tsx`

#### Hook layer
- **Replace** `useReportsData`. New version: lambda mode calls `api.reports.businessOverview()` only. Non-lambda also calls the same adapter (no Supabase). Returns the raw payload (or null per field). Removes the entire `since30/since7/supabase.from(...)` block.
- **Delete** `useTopAccounts` Supabase hook (top accounts now live inside business overview payload).
- **Delete** static demo arrays `approvalTrend`, `txnMix`, `alertVolume`.
- **Drop** `import { supabase }` if no remaining usage on this page.

#### KPI strip
- Network Volume (30d): render per-currency badges from `volume_by_currency_30d` (LYD, USD, EUR, GBP via `displayCurrency`); never sum across currencies.
- Total Customers / Total Transactions: keep `dashSummary` source (already real).
- Avg Txn Value (loaded): LYD-only ratio derived from `volume_by_currency_30d.LYD / counts.posted_lyd` if backend exposes; otherwise `BackendPending` for that one card.
- Approval Time: `BackendPending` (no endpoint).
- Rejection Rate: `counts.rejection_rate` straight from backend; else `BackendPending`.
- Top-level `overviewPending` block stays only when the entire business overview call fails or returns null.

#### Business cards (per-widget BackendPending)
- Daily Transactions ← `daily_volume_7d` (LYD series). When null/empty → `BackendPending` inside the card frame.
- Balance by Currency pie ← `currency_distribution`, filtered through `displayCurrency`. Invalid currencies render legend label "Currency missing" and are excluded from the pie.
- Peak Hours ← `hourlyTraffic`. Replace hardcoded "15:00" with `argmax(v)` from data; "—" when empty. Empty array → BackendPending in the chart area only (KPI label still renders "—").
- Approval Speed card body → `BackendPending endpoint="GET /reports/approval-speed"`.
- Customer Growth ← `customer_growth_7m`. Empty → BackendPending.
- Top Accounts ← `top_accounts` from overview. Validate each row's `currency_code` via `displayCurrency`. Empty → BackendPending. Remove the `useTopAccounts` Supabase fallback.
- Cash Flow ← already pivoted; keep LYD-only filter, add `LYD` `<CurrencyBadge>` to the card header to make scope explicit. Replace hardcoded "+12.4%" Net Flow with `Σ deposits - Σ withdrawals` sign+value from the LYD pivot, or "—" when empty.
- Transaction Mix card → `BackendPending endpoint="GET /reports/transaction-mix"`.
- Liquidity Health grid:
  - Field renames: `currency_code`, `vault_name`, `balance_minor`, `target_minor`, `min_minor`, `days_of_cover`, `minimum_threshold_breach`.
  - Validate currency via `displayCurrency`; invalid → render "Currency missing" badge, skip `formatMinor`.
  - Derive health: `minimum_threshold_breach === true` → "Critical"; else `days_of_cover != null && days_of_cover < 7` → "Watch"; else "Healthy".
  - Show `vault_name` above the currency badge.
  - When `days_of_cover` is null render "—", never 0.
  - Empty rows → BackendPending.

#### Tellers lens
- Remove the literal fallback values `24 / 63 / 99.1% / 2.5 min` from KPI cards. Replace with `—` and `Backend pending` always (these aggregates aren't in `/tellers/today`). Add a one-line note comment explaining why and the missing endpoint name.
- Keep the existing per-card BackendPending block when `tellers.length === 0`.
- Volume by Teller chart: empty array → `BackendPending endpoint="GET /reports/tellers/today"` instead of empty bars.
- Processing Time card: empty → `BackendPending endpoint="GET /reports/processing-time-distribution"`.
- Rejection/Error Rate card: empty → `BackendPending endpoint="GET /reports/rejection-rate-trend"`.

#### Compliance lens
- KPI strip already correct (counts straight from backend).
- KYC / Sanctions / Document Verification / AML gauges: per-row null check using new typed gauges. When the gauge is `null` render an inline `BackendPending` row inside the same card (small variant), not a fabricated `0%`. Keep the bar visual when both pct are present.
- Alert Volume area chart: read `compliance.alert_volume`. Drop the `isLambda ? ... : alertVolume` ternary; in non-lambda also use real data (never `alertVolume`). Empty → BackendPending.
- Risk Typology pie: read `compliance.typology`. Empty → BackendPending.

### `docs/LAMBDA_REPORTS_WIRING_AUDIT.md` (new file)

Sections:
1. **Wiring table** with columns:
   `Report section | UI widget | Endpoint | Backend fields used | Status (wired / pending) | Fix applied | Remaining backend gap`
   One row per widget covering all 9 lenses above plus Approval Speed and Transaction Mix.
2. **Confirmations**:
   - All mock/static report values disabled in lambda mode (lists removed: `approvalTrend`, `txnMix`, `alertVolume`, hardcoded teller KPI fallbacks `24/63/99.1%/2.5 min`, Approval Speed `19/14/≤20 min` literals, Net Flow `+12.4%`, Peak Hour `15:00`).
   - No Supabase report queries run in lambda mode (removed: `useReportsData` Supabase branch, `useTopAccounts`, page-level `supabase.from` calls).
   - No frontend FX calculation (cash-flow LYD-only, network total left to backend, currency-by-currency volume only).
   - Business / Teller / Compliance fully audited.
3. **Outstanding BackendPending widgets** with the exact missing endpoint/field:
   - Approval Speed card → `GET /reports/approval-speed`
   - Transaction Mix card → `GET /reports/transaction-mix`
   - Tellers KPI aggregates (active, avg/teller/day, network accuracy, avg time) → fields not present in `/reports/tellers/today` payload
   - Liquidity Health network total → `network_total_lyd_minor`, `missing_rates`
   - Compliance gauges → `kyc.current_pct/target_pct`, `aml.*`, `doc_verification.*`, `sanctions.*` per-gauge nullability

## Out of scope

- No design or layout changes — every card frame, header, grid, and colour stays.
- No section removals or reorders.
- No new endpoints, no mock fallbacks, no Supabase fallbacks on this page.
- No FX conversion in the frontend; cross-currency totals never combined.
- Saved Reports list at the bottom stays disabled buttons — unchanged.

## Verification

- Typecheck.
- Load `/app/reports` in lambda mode and check:
  - Business lens: KPI strip shows real per-currency volumes; Daily Transactions / Balance pie / Customer Growth / Top Accounts render real backend data or per-card BackendPending; Approval Speed and Transaction Mix cards show BackendPending; Cash Flow header carries an LYD badge with derived net flow; Liquidity Health shows `vault_name`, derived health, real `days_of_cover`.
  - Tellers lens: no `24/63/99.1%/2.5 min`. Empty payload → BackendPending across podium/leaderboard/volume chart; processing-time and rejection-rate cards render real series or BackendPending.
  - Compliance lens: real flagged/pending/resolved/high-risk; gauges show inline BackendPending where null; Alert Volume + Risk Typology read mapped fields; no `alertVolume` constant referenced.
- Grep for removed identifiers: `approvalTrend`, `txnMix`, `alertVolume`, `useTopAccounts`, `supabase.from(` inside `app.reports.tsx` — all should return zero matches.
- Confirm `docs/LAMBDA_REPORTS_WIRING_AUDIT.md` exists with the table and the four confirmations.
