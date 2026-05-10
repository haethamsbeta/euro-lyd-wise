## Goal
`/reports/business/overview` is live but the FE adapter expects `counts.{total,posted,rejected}` while backend returns `counts.{tx_total, tx_posted, tx_rejected, active_holders}`. Active holders also lives inside `counts` (not at root). Fix mapping with alias support so widgets render. No redesign, no mock data, no FX, no Supabase.

## Changes

### 1. `src/lib/api/reports.ts`

**`BusinessOverviewResponse`**
- Move `active_holders` into the optional surfaced fields (keep root accessor for back-compat).
- Add optional `dahab_account_number` and `account_number` on `top_accounts` row.

**`businessOverview()` mapping**
- `counts`:
  - `total`     ← `c.total ?? c.tx_total`
  - `posted`    ← `c.posted ?? c.tx_posted`
  - `rejected`  ← `c.rejected ?? c.tx_rejected`
  - `pending`   ← `c.pending ?? c.tx_pending` (nullable)
  - `rejection_rate` ← unchanged, nullable
- `active_holders`: read from `r.active_holders ?? r.counts?.active_holders` and expose at top level.
- `top_accounts[]` row aliases:
  - `account_id`  ← `account_id ?? holder_account_id ?? account_number ?? dahab_account_number`
  - `name`        ← `name ?? canonical_name ?? account_display_name`
  - `currency`    ← `currency ?? currency_code`
  - keep `balance_minor`
  - surface `dahab_account_number` and `account_number` for optional display.
- `currency_distribution[]`, `daily_volume_7d[]`, `volume_by_currency_30d[]`: already alias `currency_code` — keep, plus accept `date` for `day` and `count` for `tx_count`/`posted_count`.
- `customer_growth_7m[]`: accept `new_customers ?? new_holders`.

### 2. `src/routes/app.reports.tsx`

- Top KPI strip BackendPending banner (line ~310): change `endpoint="GET /reports/overview"` → `"GET /reports/business/overview"`.
- KPI strip: confirm tiles read from normalized `counts.total/posted/rejected` and `overview.active_holders` (already wired through adapter once aliases land).
- Top Accounts (~line 488): keep current layout. Optionally show `a.dahab_account_number ?? a.account_number` as a small muted line under the name when present. No style/layout changes.
- All `BackendPending` guards stay as `array.length === 0` — they will simply stop firing once the adapter returns mapped rows.

### 3. `docs/LAMBDA_REPORTS_WIRING_AUDIT.md`
- Mark Business Overview section as **Live & mapped**.
- Note the accepted alias pairs:
  - counts: `tx_total↔total`, `tx_posted↔posted`, `tx_rejected↔rejected`, `active_holders` lives under `counts`.
  - top_accounts: `holder_account_id`, `canonical_name`/`account_display_name`, `dahab_account_number`/`account_number`, `currency_code`.
  - daily_volume / volume_by_currency / currency_distribution: `currency_code`.
- Update "remaining gaps" to drop Business Overview rows.

### 4. Verify
Run `bunx tsc --noEmit`. Report changed files.

## Out of scope
No redesign, no new endpoints, no mock data, no Supabase fallback, no frontend FX, no removal of report sections.
