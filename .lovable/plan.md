## Revised Rollout Plan — No Seeded FX Rates

### Change from previous plan
- **Remove all seeded FX rates.** The `fx_rates` table stays empty until an admin enters values manually via UI.
- `report_consolidated_usd()` will return `missing_rates: ['USD','EUR','LYD']` (or whichever are absent) and a `total_usd_minor` that only sums currencies with a rate present. Vaults page already shows the "missing rates" warning — admins click through to enter them.
- Add a small **Admin → FX Rates** page (`/app/admin/fx-rates`) so admins can insert/update rates without touching the DB. New rate per currency = new row (history preserved); `fx_rates_current` view always reads the latest `as_of_date`.

### Step 1 (finishing now)
1. Data migration: `DELETE FROM fx_rates;` (clears the seed rows from the previous step).
2. Build `/app/admin/fx-rates` page: list current rates per currency, "Add rate" dialog (currency, usd_rate, as_of_date, note), audit who/when via `created_by`.
3. Vaults page: when `missing_rates` non-empty, show a CTA linking admins to `/app/admin/fx-rates`.

### Step 2 — Branches + Teller dimension
- New `branches` table (code, name, city, status).
- `profiles.branch_id` (nullable FK).
- `transactions.branch_id` denormalized at insert via trigger from creator's profile.
- Admin page to CRUD branches and assign tellers.

### Step 3 — Teller daily stats (trigger-maintained, mirrors `account_balances`)
- `teller_daily_stats(teller_id, day, txn_count, volume_usd_minor, corrections, accuracy_pct, avg_duration_ms, streak_days)`.
- Trigger on `transactions` after insert/update of status, plus `teller_corrections` table for manual flags.
- Powers Tellers Lens: podium, sparklines, accuracy, streaks.

### Step 4 — Business Lens SQL functions (no new tables)
- `report_cash_flow(days, currency)` → deposits/withdrawals per day in USD-minor (uses `fx_rates_current`).
- `report_approval_speed(window)` → avg/best minutes from `created_at → posted_at`.
- `report_hourly_traffic(date_range)` → count by hour-of-day, plus peak hour.

### Step 5 — Liquidity
- `vault_targets(vault_account_id, target_minor, min_reserve_minor, currency)` admin-editable.
- `report_liquidity_health()` returns days-of-cover per currency vs targets.

### Step 6 — Internal transfers (for real Mix pie)
- Add `transfer` value to `tx_channel` enum OR new `transfers(from_tx_id, to_tx_id)` linking table — TBD when we get there.

### Step 7 — Compliance Lens
- `compliance_alert_typology` enum (structuring, velocity, sanctions_hit, kyc_gap, large_cash, …).
- `compliance_alerts(holder_id, typology, severity, status, opened_at, closed_at, assignee, notes)`.
- `compliance_holder_risk(holder_id, risk_score 0–100, kyc_status, sanctions_checked_at)`.
- `compliance_targets(metric, target_value)` admin-editable.
- View `compliance_health_metrics` rolls alerts + risk vs targets.

### Step 8 — Saved Reports
- `saved_reports(name, owner, lens, filters_jsonb, schedule)` and `report_runs(saved_report_id, ran_at, output_path)`.

### Security (all new tables)
- RLS: staff read, admin write, except `compliance_*` which is admin/auditor only.
- All admin-edited tables get `created_by`, `updated_at` and audit triggers writing to `audit_log`.

### Order of execution
Step 1 (this turn) → Step 2 → Step 3 → Step 4 → Step 5 → Step 6 → Step 7 → Step 8. Each step ships migration + minimal admin UI + wires the corresponding Reports/Vaults card to live data.
