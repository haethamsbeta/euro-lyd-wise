## Changes

### 1. Reports — Top Accounts limit (10 not 50)
File: `src/routes/app.reports.tsx`

The backend returns up to 50 `top_accounts`. Slice to the first 10 before rendering.

- Change `topAccounts.map((a, i) => ...)` to `topAccounts.slice(0, 10).map(...)`.
- Update the debug line `top_accounts: {topAccounts.length}` to also show the rendered count, e.g. `top_accounts: {Math.min(topAccounts.length, 10)}/{topAccounts.length}`.

No backend or query changes.

### 2. Vaults page — group Receivable + Payable per currency into a single card
File: `src/routes/app.vaults.index.tsx`

Today the "Official Vault Accounts" grid renders one card per official vault account (e.g. `Cash Receivable LYD`, `Cash Payable LYD`, `Cash Receivable USD`, …). The user wants one card per currency that combines the receivable and payable side, while still showing each side's balance.

Approach (frontend-only, no FX math):

1. Group `vaults` by `currency_code`. Within each group, separate by `internal_role` regex (`/receiv/i`, `/pay/i`); anything else becomes "other".
2. Render one card per currency in the grid. Each card shows:
   - Currency badge as the headline.
   - Channel icon (use `Banknote` if any cash, else `Building2`).
   - Two stacked rows inside: **Receivable** (sum of `balance_minor` over receivable vaults in that currency, formatted via `formatMinor`) and **Payable** (same for payable). Show "—" if a side is absent.
   - Net = receivable − payable, displayed as the prominent balance using `formatMinor`.
   - Small footer line listing the underlying vault names (e.g. "2 vault accounts").
3. Card click behaviour: if the group has exactly one underlying vault, link to that vault detail; otherwise link to the receivable vault by default (first vault in group) — keeps existing detail page untouched.
4. Keep the existing "Currency Cash Vault Summary" strip above as is (it already groups net by currency from backend). The new grouped cards replace the current per-account grid.

No changes to backend, `vaults.list()` adapter, or vault detail route.

### 3. Verification
- Run typecheck.
- Confirm Reports renders ≤10 rows in Top Accounts.
- Confirm Vaults page shows one card per currency with receivable + payable balances visible.

## Out of scope
- No backend changes, no mock data, no Supabase fallback edits, no FX conversion in frontend, no redesign of detail pages.
