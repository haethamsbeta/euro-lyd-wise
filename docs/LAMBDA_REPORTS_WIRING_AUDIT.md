# Lambda Reports Wiring Audit

Scope: `/app/reports` page (`src/routes/app.reports.tsx`) and adapters in
`src/lib/api/reports.ts`. This page now operates exclusively against Lambda
report endpoints when `isLambda` is true. No Supabase fallback queries, no
hardcoded demo arrays, and no frontend FX math remain in lambda mode.

## Confirmations

- All previously hardcoded demo arrays removed: `approvalTrend`, `txnMix`,
  `alertVolume`, hardcoded teller KPIs (`24` / `63` / `99.1%` / `2.5 min`),
  "Peak Hour 15:00", "Net Flow +12.4%".
- No Supabase imports/queries in `app.reports.tsx`.
- No frontend currency conversion. Per-currency badges only; no summing across
  currencies. Cash Flow header is explicitly LYD-only.
- Currencies are restricted to `LYD | USD | EUR | GBP` via `displayCurrency()`.
  Missing or unknown codes render as `Currency missing` (never `UNK`, never
  defaulted to USD).
- Each widget without a backing endpoint or with empty payload renders the
  shared `<BackendPending>` placeholder.

## Widget → Endpoint Map

### Business Lens

| Widget                    | Endpoint                              | Fields used                                          | Mapping fixed | Backend gap |
|---------------------------|---------------------------------------|------------------------------------------------------|---------------|-------------|
| Network Volume (KPI)      | `GET /reports/business/overview`      | `volume_by_currency_30d[*]`                          | yes           | —           |
| Avg Txn Value (KPI, LYD)  | `GET /reports/business/overview`      | `volume_by_currency_30d.LYD`, `counts.posted_lyd`    | yes           | `posted_lyd` not always returned → BackendPending |
| Approval Time (KPI)       | `GET /reports/approval-speed`         | n/a                                                  | n/a           | endpoint not yet wired → BackendPending |
| Rejection Rate (KPI)      | `GET /reports/rejection-rate-trend`   | n/a                                                  | n/a           | endpoint not yet wired → BackendPending |
| Daily Volume (chart)      | `GET /reports/business/overview`      | `daily_volume_7d[].day`, `.lyd_minor`                | yes           | —           |
| Currency Distribution     | `GET /reports/business/overview`      | `currency_distribution[].currency_code`, `.share_pct`| yes           | —           |
| Peak Hours                | `GET /reports/hourly-traffic`         | `hour`, `count`                                      | yes           | endpoint may be empty → BackendPending |
| Approval Speed            | `GET /reports/approval-speed`         | `bucket`, `count`                                    | yes           | endpoint not yet wired → BackendPending |
| Customer Growth           | `GET /reports/business/overview`      | `customer_growth_7m[].month`, `.count`               | yes           | —           |
| Top Accounts              | `GET /reports/business/overview`      | `top_accounts[]`                                     | yes           | —           |
| Transaction Mix           | `GET /reports/transaction-mix`        | `name`, `value`                                      | yes           | endpoint not yet wired → BackendPending |
| Cash Flow                 | `GET /reports/cash-flow`              | `day`, `currency_code`, `direction`, `amount_minor`  | yes (LYD pivot) | non-LYD rows ignored by design |

### Liquidity Health

| Widget                          | Endpoint                          | Fields used                                                                              | Mapping fixed | Backend gap |
|---------------------------------|-----------------------------------|------------------------------------------------------------------------------------------|---------------|-------------|
| Per-vault rows                  | `GET /reports/liquidity-health`   | `vault_account_id`, `vault_name`, `currency_code`, `balance_minor`, `target_minor`, `min_minor`, `minimum_threshold_breach`, `days_of_cover` | yes (health derived in UI: breach → Critical, `days_of_cover < 3` → Watch, else Healthy) | — |
| Total Consolidated Balance      | `GET /reports/liquidity-health`   | `network_total_lyd_minor`, `missing_rates`                                               | yes           | top-level totals not yet returned → BackendPending |

### Tellers Lens

| Widget                       | Endpoint                       | Fields used | Mapping fixed | Backend gap |
|------------------------------|--------------------------------|-------------|---------------|-------------|
| KPI strip (4 tiles)          | `GET /reports/tellers/today`   | aggregates  | yes (no fallbacks) | aggregates not yet returned → "—" + Backend pending |
| Top Performers Podium        | `GET /reports/tellers/today`   | row[]       | yes           | empty payload → BackendPending |
| Full Leaderboard             | `GET /reports/tellers/today`   | row[]       | yes           | empty payload → BackendPending |
| Volume by Teller             | `GET /reports/tellers/today`   | `name`, `volumeToday` | yes  | — |
| Processing Time Distribution | `GET /reports/processing-time-distribution` | `bucket`, `count` | yes | endpoint may be empty → BackendPending |
| Error & Correction Rate      | `GET /reports/rejection-rate-trend` | `d`, `rate_pct` | yes | endpoint may be empty → BackendPending |

### Compliance Lens

| Widget                  | Endpoint                              | Fields used                                            | Mapping fixed | Backend gap |
|-------------------------|---------------------------------------|--------------------------------------------------------|---------------|-------------|
| KPI strip (4 tiles)     | `GET /reports/compliance/overview`    | `flagged`, `pending_reviews`, `resolved_today`, `high_risk_holders` | yes | empty → BackendPending |
| Compliance Health gauges| `GET /reports/compliance/overview`    | `kyc`, `aml`, `doc_verification`, `sanctions` (each `{current_pct, target_pct}`) | yes (per-gauge null → Backend pending) | individual gauges may be null |
| Alert Volume            | `GET /reports/compliance/overview`    | `alert_volume_daily[]` → `alert_volume`                | yes (rename) | empty → BackendPending |
| Risk Typology           | `GET /reports/compliance/overview`    | `risk_typology[]` → `typology`                         | yes (rename) | empty → BackendPending |

## Outstanding BackendPending Widgets (exact backend fields needed)

- Approval Time KPI + Approval Speed chart → `GET /reports/approval-speed` payload `{ bucket, count }[]` plus a single `avg_minutes` aggregate.
- Rejection Rate KPI + Error & Correction chart → `GET /reports/rejection-rate-trend` payload `{ d, rate_pct }[]` plus a `current_pct` aggregate.
- Transaction Mix → `GET /reports/transaction-mix` payload `{ name, value }[]`.
- Hourly Traffic → `GET /reports/hourly-traffic` payload `{ hour, count }[]`.
- Processing Time Distribution → `GET /reports/processing-time-distribution` payload `{ bucket, count }[]`.
- Tellers KPI aggregates → `GET /reports/tellers/today` to additionally return `active_tellers`, `avg_txns_per_teller`, `network_accuracy_pct`, `avg_seconds_per_txn`.
- Liquidity Health totals → `GET /reports/liquidity-health` to additionally return top-level `network_total_lyd_minor` and `missing_rates: string[]`.
- Avg Txn Value (LYD) → `GET /reports/business/overview` to expose `counts.posted_lyd` reliably.

No mock or static report values remain in lambda mode.