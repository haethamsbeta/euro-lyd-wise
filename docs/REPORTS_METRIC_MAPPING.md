# DAHAB — Reports Metric Mapping

For every card / chart on `/app/reports`, this is the exact backend contract.

Currency rule: **never combine currencies into one total** unless using
`fx_rates`. The `Total Consolidated Balance` card on `/app/vaults` is the
only USD-equivalent total in the app and it is computed by RPC
`report_consolidated_usd()` using **manually entered rates** (no auto-fetch).

Roles allowed on `/app/reports`: `admin`, `auditor`.

---

## Business lens (default)

### B1 — Total transactions (30d)
- Status today: **real**.
- Source: `SELECT count(*) FROM transactions WHERE created_at >= now() - interval '30 days';`
- Filters: none. Grouping: none.
- API: `GET /api/reports/business/overview` field `total`.

### B2 — Posted (30d)
- Real. `WHERE status='posted' AND created_at >= now() - 30 days`.

### B3 — Rejected (30d) + Rejection rate %
- Real. `rejected = count(status='rejected')`, rate = `rejected/total*100`.

### B4 — Active holders count
- Real. `count(account_holders WHERE status='ACTIVE')`. (Currently the page counts all rows; see Needs-confirmation below.)

### B5 — Volume by currency (30d)
- Real. View **`report_volume_by_currency_30d`**.
  ```sql
  CREATE VIEW report_volume_by_currency_30d AS
  SELECT currency, sum(amount_minor) AS volume_minor, count(*) AS posted_count
  FROM transactions
  WHERE status='posted' AND created_at >= now() - interval '30 days'
  GROUP BY currency;
  ```
- Filters: date range param. Per-currency rows; never summed.
- API shape: `[{currency:'USD', volume_minor: number, posted_count: number}, ...]`

### B6 — Daily volume sparkline (7d)
- Real. View **`report_daily_volume_7d`** (one row per day × currency).
  ```sql
  CREATE VIEW report_daily_volume_7d AS
  SELECT date_trunc('day', created_at)::date AS day, currency,
         sum(case when status='posted' then amount_minor else 0 end) AS volume_minor,
         count(*) AS tx_count
  FROM transactions
  WHERE created_at >= (now()::date - interval '6 days')
  GROUP BY 1,2 ORDER BY 1;
  ```

### B7 — Currency distribution pie
- Real. View **`report_currency_distribution`** (sum of balances per currency).
  ```sql
  CREATE VIEW report_currency_distribution AS
  SELECT currency, sum(balance_minor) AS balance_minor
  FROM account_balances GROUP BY currency;
  ```
- **Do not convert to USD** in this view. The pie shows share *within currency*.

### B8 — Customer growth (7 months)
- Real. View **`report_customer_growth_7m`**.
  ```sql
  CREATE VIEW report_customer_growth_7m AS
  SELECT date_trunc('month', created_at)::date AS month, count(*) AS new_holders
  FROM account_holders
  WHERE created_at >= (now() - interval '7 months')
  GROUP BY 1 ORDER BY 1;
  ```

### B9 — Avg LYD txn value
- Real. `volume_minor[LYD]/posted_count[LYD]` from B5. Frontend can do this division because both inputs are LYD.

### B10 — Top 5 accounts by balance
- Real. View **`report_top_accounts_by_balance`**.
  ```sql
  CREATE VIEW report_top_accounts_by_balance AS
  SELECT b.account_id, a.name, b.currency, b.balance_minor
  FROM account_balances b JOIN accounts a ON a.id = b.account_id
  ORDER BY b.balance_minor DESC LIMIT 5;
  ```
  Per-currency, no FX conversion.

### B11 — Cash flow (deposits vs withdrawals daily)
- **Placeholder today.** New view **`report_cash_flow_daily`**:
  ```sql
  CREATE VIEW report_cash_flow_daily AS
  SELECT date_trunc('day', posted_at)::date AS day, currency, direction,
         sum(amount_minor) AS volume_minor, count(*) AS tx_count
  FROM transactions
  WHERE status='posted'
  GROUP BY 1,2,3;
  ```
  Frontend pivots `direction` to two series **per currency**.

### B12 — Approval speed
- Placeholder. View **`report_approval_speed`**:
  ```sql
  CREATE VIEW report_approval_speed AS
  SELECT date_trunc('day', posted_at)::date AS day,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM posted_at-created_at)) AS median_seconds,
         count(*) FILTER (WHERE status='posted') AS approved_count
  FROM transactions
  WHERE posted_at IS NOT NULL AND posted_at >= now() - interval '30 days'
  GROUP BY 1;
  ```

### B13 — Transaction mix (deposits / withdrawals / transfers)
- Placeholder. Today the app has only deposit + withdraw. **"Internal transfers" is Needs confirmation** (no schema field for it). Once added, the view is `direction` counts.

---

## Tellers lens

### T1-T6 Tellers leaderboard
- Placeholder. Requires:
  - new table `teller_daily_stats(teller_user_id, day date, branch_id, txns_count, volume_minor, currency, accuracy_pct, avg_processing_seconds)` maintained by trigger on `transactions`.
  - view `report_tellers_today` joining onto `profiles` for display name.
- Per-currency volumes only.

### T7 Processing time distribution
- View **`report_processing_time_dist`**: bucketize `posted_at - created_at`.

### T8 Rejection rate trend
- View **`report_rejection_rate_trend`**: daily `rejected_count / total_count`.

### T9 Liquidity health (days of cover)
- Placeholder. Requires new table **`vault_targets(vault_account_id, currency, target_minor, min_minor)`** + view:
  ```sql
  CREATE VIEW report_liquidity_health AS
  SELECT b.account_id, b.currency, b.balance_minor, t.target_minor, t.min_minor,
         CASE WHEN avg_daily.outflow_minor > 0
              THEN b.balance_minor / avg_daily.outflow_minor END AS days_of_cover
  FROM account_balances b
  LEFT JOIN vault_targets t USING (account_id, currency)
  LEFT JOIN LATERAL (
    SELECT avg(daily) AS outflow_minor FROM (
      SELECT sum(amount_minor) AS daily FROM transactions
      WHERE direction='withdraw' AND status='posted'
        AND vault_account_id = b.account_id AND currency = b.currency
        AND posted_at >= now() - interval '30 days'
      GROUP BY date_trunc('day', posted_at)) s) avg_daily ON true;
  ```

---

## Compliance lens (all Needs-confirmation business rules)

Requires a new schema:
- `compliance_alerts(id, transaction_id, alert_type, severity, status, opened_at, resolved_at, resolved_by)`
- enum `compliance_alert_type` (Structuring, HighValueCash, Velocity, WatchlistMatch, …)
- view `report_alert_volume_daily`
- view `report_risk_typology` (counts per `alert_type`)
- view `report_risk_metrics` (flagged today, pending reviews, resolved today, high-risk holders)

All restricted to admin + auditor.

---

## Vaults page extras

### V1 Total Consolidated Reserves (USD eq.)
- **Real**, computed by RPC `report_consolidated_usd()` (already deployed).
- Logic: `Σ balance_minor[ccy] × usd_rate(ccy, latest as_of_date) / 100` for each `ccy` that has a non-null rate. Currencies with no rate are returned in `missing_rates` and skipped from the total.
- The frontend renders a **"Set rates"** link to `/app/admin/fx-rates` when `missing_rates` is non-empty.
- Response shape:
  ```json
  {
    "total_usd_minor": 12345600,
    "breakdown": [{"currency":"USD","usd_rate":1.00,"rate_date":"2026-05-09"}],
    "missing_rates": ["LYD"],
    "computed_at": "2026-05-09T12:34:56Z"
  }
  ```

### V2 Per-vault balance cards
- Real. From `accounts kind='vault'` joined with `account_balances`, grouped by currency. No conversion.

### V3 Recent activity
- Real. `transactions WHERE vault_account_id IS NOT NULL ORDER BY created_at DESC LIMIT 8`.

---

## API response shapes (summary)

`GET /api/reports/business/overview?days=30`
```ts
{
  totals: { total:number, posted:number, rejected:number, rejection_rate:number },
  active_holders: number,
  volume_by_currency: { currency:'USD'|'EUR'|'LYD'; volume_minor:number; posted_count:number }[],
  daily_volume_7d: { day:string; currency:string; volume_minor:number; tx_count:number }[],
  currency_distribution: { currency:string; balance_minor:number }[],
  customer_growth_7m: { month:string; new_holders:number }[],
  top_accounts: { account_id:string; name:string; currency:string; balance_minor:number }[]
}
```

`GET /api/reports/cash-flow?days=7`
```ts
{ rows: { day:string; currency:string; direction:'deposit'|'withdraw'; volume_minor:number; tx_count:number }[] }
```

`GET /api/reports/approval-speed?days=30`
```ts
{ rows: { day:string; median_seconds:number; approved_count:number }[] }
```

`GET /api/reports/tellers/today`
```ts
{ rows: { teller_user_id:string; full_name:string; branch:string|null;
          txns_count:number; volume_minor:number; currency:string;
          accuracy_pct:number; avg_processing_seconds:number }[] }
```

`GET /api/reports/liquidity-health`
```ts
{ rows: { account_id:string; currency:string; balance_minor:number;
          target_minor:number|null; min_minor:number|null;
          days_of_cover:number|null }[] }
```

`GET /api/reports/compliance/overview`
```ts
{ flagged_today:number, pending_reviews:number, resolved_today:number,
  high_risk_holders:number,
  typology: { alert_type:string; count:number }[],
  alert_volume_daily: { day:string; generated:number; resolved:number }[] }
```

---

## Needs confirmation

- Should "Active holders" count `status='ACTIVE'` only? Frontend currently counts all.
- Is `direction` extended with `transfer` (internal transfer)? Required for B13.
- Does GBP need to be added to the `currency_code` enum?
- What are the exact rule definitions for compliance alert types?
- Should `report_consolidated_usd` use the latest rate prior-or-equal to a chosen date (point-in-time) or always today?
