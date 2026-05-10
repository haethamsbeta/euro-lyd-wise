## Goal

Correct cash-vault grouping and labels so the UI distinguishes:

- **Official vault account** = one receivable OR payable account (single currency, single role)
- **Currency cash vault** = receivable + payable pair grouped by `currency_code`
- **Currency cash vault balance** = `Σ balance_minor` for that currency (payable rows already negative — never subtract twice)

Design unchanged. Data source and labels only.

## Source of truth

- Dashboard currency cash totals → `summary.cash_by_currency` from `GET /dashboard/staff` (already net per currency).
- Bank totals → `summary.bank_by_currency` when `bank_split_available=true`, else `<BackendPending>`. No fabricated zeros.
- Official vault account list → `GET /vaults` (one row per receivable/payable account).
- Vault detail → `GET /vaults/:id` for that single account only.
- Liquidity health → `GET /reports/liquidity-health` grouped rows. No FE FX math.

## Frontend changes

### 1. `src/lib/api/dashboard.ts`
Extend `AdminDashboard` adapter to surface, in lambda mode:
- `cash_by_currency: Array<{ currency, net_balance_minor }>`
- `bank_by_currency: Array<{ currency, net_balance_minor }> | null`
- `bank_split_available: boolean`

Map straight from `res.summary.cash_by_currency` / `res.summary.bank_by_currency` / `res.summary.bank_split_available`. Do not compute net — backend value is already `Σ balance_minor` per currency.

### 2. `src/routes/app.index.tsx` — Network Pulse + Vault gauges

- Replace the per-vault heuristic in `useTotals` (lines 152–172) for **lambda mode** with values read from `dashboard.cash_by_currency` / `dashboard.bank_by_currency`. Supabase fallback path keeps current grouping.
- Network Pulse currency tiles (line 314+): show one tile per currency present in `cash_by_currency`. Value = `net_balance_minor` for that currency (cash). If `bank_split_available`, add bank line; otherwise omit (no `cash+bank` sum).
- Cash Vaults gauge: rows derived from `cash_by_currency` rows, label remains "Cash Vaults" but row label per currency reads e.g. `LYD currency cash vault`.
- Bank Vaults gauge: keep existing `<BackendPending>` when `bank_split_available=false`.
- Remove the `(cashByCur + bankByCur)` addition on line 316; show net cash directly.

No mock data, no FX math, no Supabase fallback in lambda mode.

### 3. `src/routes/app.vaults.index.tsx` — Official vault accounts list
- Keep the existing grid of all 10 official vault accounts. One card per account, single-currency, single-role. No merging.
- Above the grid, add an optional **Currency Cash Vault Summary** section (only when `cash_by_currency` is available). One card per currency:
  - `currency_code`
  - `net_balance_minor` (from `summary.cash_by_currency`)
  - receivable account count, payable account count (derived by grouping the existing `/vaults` rows by `currency_code` + `internal_role` regex `/receiv/` vs `/pay/`)
  - `total_inflow_minor`, `total_outflow_minor`, `transaction_rows` only if backend returns them on `summary.cash_by_currency`; otherwise omit those lines (no zeros).
- Underneath each currency group card, the underlying receivable/payable accounts continue to render in the existing grid — do not replace the grid.
- Replace the current "Consolidated Reserves (USD eq.)" computation: in lambda mode use `liquidity-health.network_total_lyd_minor` (LYD eq.) and rename the tile accordingly. Supabase path unchanged.

### 4. `src/routes/app.vaults.$id.tsx` — Vault detail
- No grouping changes. Verify page shows only the single official vault account (no sibling combination, no multi-currency view). Confirm header label uses "Official vault account" terminology.

### 5. Labels / terminology pass
Where the UI currently says "Cash Vaults" referring to a single-currency aggregate, prefer:
- Network Pulse tiles → "{CCY} currency cash vault"
- Vaults page summary → "Currency Cash Vault Summary"
- Vaults page grid heading → "Official Vault Accounts" (was "Reserve Vaults")
- Vault detail → "Official vault account"

### 6. Guards
- If a `cash_by_currency` row has `currency` not in {LYD, USD, EUR, GBP}, render `Currency missing` (using existing `formatMinorOrMissing`). No USD/UNK fallback.
- When `cash_by_currency` is absent in lambda mode, render `<BackendPending>` for Network Pulse cash tiles + Cash Vaults gauge (do not silently fall back to per-vault summing in lambda).

### 7. Documentation
Update `docs/DASHBOARD_REPORTS_BACKEND_METRICS_GAP.md` and `docs/LAMBDA_FULL_ENDPOINT_AND_BALANCE_AUDIT.md`:
- Reflect that `summary.cash_by_currency` is the canonical net source and is consumed.
- Keep `bank_by_currency` + `bank_split_available` listed as remaining backend gap.
- Note optional fields the grouped summary would consume if backend ships them: `total_inflow_minor`, `total_outflow_minor`, `transaction_rows`.

## Out of scope

- No UI redesign, no section removal.
- No write/mutation endpoints.
- No FE FX conversion.
- No Supabase usage in lambda mode for the touched paths.
- No changes to the official vault accounts grid or to vault detail beyond label wording.

## Verification

- Typecheck.
- Grep: no `cashByCur + bankByCur` sums remain in lambda branch; no hard-coded `"USD"` fallback added.
- Confirm each currency from backend `cash_by_currency` (EUR `-14,500,000`, LYD `+1,668,301,000`, USD `-203,702,400`) renders once with the correct sign on Dashboard.
- Confirm Vaults page still lists all 10 official accounts individually.
