## P0/P1 Lambda fixes from `LAMBDA_FULL_ENDPOINT_AND_BALANCE_AUDIT.md`

Apply minimal, surgical wiring fixes — no redesign, no removed sections, no mock data, no Supabase fallback in lambda mode, no balances calculated from page rows.

### P0

1. **`src/routes/app.transactions.$id.tsx`** — in lambda mode, drop the Supabase tx fetch + audit/profile/attachment side queries. Use `api.transactions.get(id)` and map: `tx_number, holder_name, account_number, dahab_account_number, account_display_name, amount_minor, currency_code, direction, channel, status, transaction_category, comment/description, posted_at, created_at`, plus correction/reversal and vault fields when present. Any missing field renders `—` or a `<BackendPending>` chip for that field only. Approve/reject/correct mutations stay disabled in lambda mode (no Supabase RPC). Attachment storage links remain Supabase-only and are hidden in lambda mode.

2. **`src/routes/m.dashboard.tsx`** — in lambda mode, replace the Supabase `accounts` + `account_balances` + `transactions` queries with `api.dashboard.admin()` (KPIs from `summary` only), `api.vaults.list()` (balances from `balance_minor` only), and `api.transactions.list({ limit: 8 })` (amounts from `amount_minor` only). Supabase path kept for `DATA_BACKEND !== "lambda"`.

3. **`src/routes/portal.tsx`** and **`src/routes/portal.$accountId.$currency.tsx`** — in lambda mode, short-circuit before any Supabase call and render `<BackendPending>` for the whole page (portal API not yet exposed). Supabase path untouched outside lambda mode.

### P1

4. **Dashboard Network Pulse (`src/routes/app.index.tsx`)** — keep the cash totals (clearly labelled "Vault / Cash"), but render the bank-side tile as `<BackendPending>` until the backend exposes `bank_by_currency`. No `0` placeholder.

5. **Dashboard Txns Today (TellerDashboard tile in `app.index.tsx`)** — stop counting `recentTx` filtered to today. Read `summary.txns_today`; if absent, render `—`.

6. **`RecentTransactionsTable` (in `app.index.tsx`)** — remove the Supabase holder/account lookup branch in lambda mode and read `holder_name`, `account_number`, `dahab_account_number` straight from the row (already propagated by `useDashData`).

7. **`PinnedCustomers` (in `app.index.tsx`)** — in lambda mode, replace the Supabase `holder_accounts` query with `api.accounts.get(id)` + `api.holders.totals(holderId)` per pinned id. If any required field is missing, render `<BackendPending>` for that pin instead of falling back to Supabase or mock.

8. **Reports cash-flow pivot (`src/lib/api/reports.ts` + `src/routes/app.reports.tsx`)** — backend now returns `{ day, currency_code, direction, transaction_count, volume_minor }`. Update the adapter to return raw rows; pivot in the route by `day + currency_code` mapping `direction=deposit → deposits_minor`, `direction=withdraw → withdrawals_minor`. Do not sum across currencies; do not perform FX. Existing chart shape (`{ d, deposits, withdrawals }`) is preserved per currency series.

9. **`src/routes/app.me.activity.tsx`** — in lambda mode, call `api.transactions.myRecent(50)`. If the endpoint 404s, render `<BackendPending>`. Supabase path untouched outside lambda mode.

10. **Currency guards** in `src/routes/app.transactions.index.tsx` and `src/routes/app.index.tsx` (`RecentTransactionsTable`): wrap each `formatMinor(amount, currency)` call with a guard — when `currency` is missing/not in `LYD/USD/EUR/GBP`, render the literal "Currency missing" badge instead of falling back to USD/UNK.

### Documentation

Update `docs/LAMBDA_FULL_ENDPOINT_AND_BALANCE_AUDIT.md`:
- Add a "Fixes applied in this pass (P0/P1)" section listing each edited file and the new wiring.
- Mark fixed rows ✅ in the matrices.
- Restate remaining backend gaps: `summary.txns_today`, `summary.cash_by_currency`/`bank_by_currency`, portal API, `/admin/users`, `/reports/anomalies`, write endpoints (POST tx/approval/fx/holder).
- List remaining Supabase usage in lambda mode (should be: none of the items above; storage attachments in tx detail are hidden, not used). Confirm balance source-of-truth rules: vault balances ← `/vaults.balance_minor`; account balances ← `/holder-accounts.current_balance`; ledger running balance ← `balance_after`; transaction amounts ← `amount_minor`; vault activity ← `cash_vault_effect_minor ?? amount_minor`.

### Out of scope

- No UI redesign, no section removal.
- Write endpoints (POST tx/approval/fx/holder) stay disabled.
- P2/P3 items (`/app/users`, `/app/admin/branches`, `/app/groups`, `/app/portal-accounts`, anomaly feed) untouched.
