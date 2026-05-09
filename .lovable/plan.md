# Reports, Insights & Vaults — Data Model Plan

The redesigned **Reports** page (3 lenses: Business / Tellers / Compliance) and the **Vaults** index render many metrics. Some are wired to live tables; most are hardcoded demo data or computed client-side with hardcoded constants. Below is the full inventory + the schema work needed to back every metric properly — built the same way `account_balances` is (canonical tables → triggers/views → SQL functions → RLS).

---

## 0. Where does "Consolidated Reserves (USD eq.)" come from today?

In `src/routes/app.vaults.index.tsx`:

```ts
const USD_RATE = { USD: 1, EUR: 1.08, LYD: 0.21 };  // ← hardcoded in the file
consolidatedUsd = Σ vault.account_balances[*].balance_minor × USD_RATE[currency]
```

So the number is just every vault balance multiplied by **fixed FX constants in the source code**. There is no DB table, no audit trail, no admin control. This must move into the database (see §3.A).

---

## 1. Already live (no DB change needed)

Reports page widgets that read real data:
- Network Volume (30d), Approved Txns, Rejection Rate, Active Customers, Avg Txn Value (LYD)
- Daily Transactions chart (7d volume), Customer Growth (7 months), Balance by Currency, Top Accounts

Vaults page widgets that read real data:
- Per-vault balances per currency (from `account_balances`)
- Vault count, recent vault activity (latest 8 from `transactions`)

---

## 2. New metrics on the **Vaults** page that need DB support

### A. Consolidated Reserves (USD eq.)
- **`fx_rates`** (new table): `currency` (PK with `as_of_date`), `usd_rate` (numeric), `source` (`manual` / `provider`), `as_of_date`, `created_by`, `created_at`
- **`fx_rates_current`** (view): latest rate per currency
- SQL function `report_consolidated_usd()` → sums all vault `account_balances.balance_minor × fx_rates_current.usd_rate`
- Admin UI surface to edit rates; full history kept for audit

### B. Per-vault health
- **Days of Cover** per vault (vault balance ÷ avg daily outflow per currency) — same `liquidity_thresholds` & function as Reports §2.G
- **Utilization %** (current balance vs. configured target reserve)
- **`vault_targets`** (new): `vault_id`, `currency`, `target_balance_minor`, `min_reserve_minor`

### C. Vault flow KPIs (currently absent)
- Net inflow / outflow per vault (24h, 7d) — from `transactions` filtered by `vault_account_id`
- Counterparty breakdown: which holders moved most through the vault
- SQL function `report_vault_activity(vault_id, days)`

### D. Vault status flags
- **Low-balance** badge: derived from `vault_targets.min_reserve_minor`
- **Stale** badge: no posted activity in N days
- Both can be SQL functions or computed columns

---

## 3. New metrics on the **Reports** page that need DB support

### A. Branch & Teller dimension (Tellers lens — currently fully fake)
- **`branches`** (new): `id`, `name`, `city`, `timezone`, `is_active`
- **`profiles`**: add `branch_id`, `employee_code`, `display_avatar`
- **`transactions`**: add `branch_id` (denormalized at post time) + already-present `created_by_user_id`

### B. Teller productivity & quality
- **`transactions`**: add `processed_duration_ms` → Avg Time / Transaction, Processing Time Distribution
- **`teller_corrections`** (new): `original_tx_id`, `corrected_by_tx_id`, `teller_user_id`, `reason` → Error & Correction Rate, per-teller Accuracy %
- **`teller_daily_stats`** (new, trigger-maintained like `account_balances`): `teller_id`, `date`, `txn_count`, `volume_minor`, `currency`, `corrections`, `accuracy_pct`, `avg_duration_ms`, `streak_days` → leaderboard, podium, sparklines, streak

### C. Approval-speed metrics
- Already derivable from `transactions.created_at` → `posted_at`
- New SQL function `report_approval_speed(window)` returning `{day, avg_minutes, best_minutes, target_minutes}` → Approval Speed card + line chart

### D. Cash flow (Inflow vs Outflow)
- SQL function `report_cash_flow(days, currency)` → `[{day, deposits_minor, withdrawals_minor}]` — drives the area chart and Net Flow %

### E. Transaction Mix
- Add `transfer` to `tx_direction` enum (or new `transfers` table) so the Deposits / Withdrawals / Internal Transfers pie reflects reality

### F. Hourly traffic / Peak Hours
- SQL function `report_hourly_traffic(date_range)` → `[{hour, count}]` + computed Peak Hour

### G. Liquidity Health (days-of-cover, used by both Reports & Vaults)
- **`liquidity_thresholds`** (new): `currency`, `watch_days`, `critical_days`
- SQL function `report_liquidity_health()` → `[{currency, vault_balance_minor, avg_daily_outflow_minor, days_of_cover, health_band}]`

### H. Compliance lens (currently 100% fake)
- **`compliance_alerts`** (new): `transaction_id`, `holder_id`, `typology` (enum: `structuring`, `high_value_cash`, `velocity`, `watchlist_match`, `other`), `severity`, `status` (`open`/`under_review`/`resolved`/`false_positive`), `assigned_to`, timestamps, `resolution_note`
- **`compliance_holder_risk`** (new): `holder_id`, `risk_score` (0–100), `risk_band`, `kyc_status`, `sanctions_checked_at`, `documents_verified`
- **`compliance_targets`** (new): metric → target % (KYC, Sanctions, Doc Verification, AML Resolution)
- **`compliance_health_metrics`** (view) → Compliance Health bars, Alert Volume chart, Risk Typology pie, KPI strip (Flagged / Pending / Resolved Today / High-Risk Holders)
- Add `compliance_officer` to `app_role` enum

### I. Saved Reports (replace 8 disabled buttons)
- **`saved_reports`** (new): `name`, `report_type`, `params` jsonb, `created_by`, `last_generated_at`, `file_path`
- **`report_runs`** (new): historical PDF generation log

---

## 4. Aggregation strategy (mirrors `account_balances`)

`account_balances` is a denormalized cache kept in sync by triggers on `ledger_entries`. We follow the same pattern for high-traffic report metrics:

- **`teller_daily_stats`** ← trigger on `transactions` (status → posted)
- **`branch_daily_stats`** ← same trigger, grouped by `branch_id`
- **`vault_daily_flow`** ← trigger on posted vault-side `ledger_entries`
- **`liquidity_daily_outflow`** ← trigger on posted withdrawals, grouped by currency
- **`compliance_daily_stats`** ← trigger on `compliance_alerts` insert/resolve
- **`fx_rates_current`** ← view over `fx_rates`

Lower-traffic metrics (peak hours, txn mix, customer growth) stay as on-demand SQL functions.

---

## 5. Security & RLS

- All new tables get RLS enabled
- Staff (`is_staff(auth.uid())`) → SELECT
- Admin → INSERT/UPDATE on config tables (`fx_rates`, `liquidity_thresholds`, `vault_targets`, `compliance_targets`, `branches`)
- Tellers → SELECT only their own row in `teller_daily_stats`
- Compliance writes restricted to admin + new `compliance_officer` role

---

## 6. Suggested rollout order

1. **`fx_rates` + `report_consolidated_usd()`** — kills the hardcoded USD rates on Vaults
2. **Branches + teller dimension** (`branches`, `profiles.branch_id`, `transactions.branch_id`, `processed_duration_ms`) — unblocks Tellers lens
3. **`teller_daily_stats` + trigger** — leaderboard, podium, sparklines, streak
4. **Cash flow + hourly traffic + approval speed SQL functions** — finishes Business lens
5. **`liquidity_thresholds` + `vault_targets` + days-of-cover function** — Liquidity Health (Reports) + per-vault health (Vaults)
6. **Internal transfers** (enum or new table) — Transaction Mix accuracy
7. **Compliance schema** (alerts, holder_risk, targets, health metrics) — Compliance lens
8. **Saved reports + runs** — replaces the disabled grid

---

If this looks right, approve and I'll generate the migrations in that order (one approval per migration so types regenerate cleanly between steps).
