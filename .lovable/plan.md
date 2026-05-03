## Goal

On the staff Account Detail page (`/app/accounts/$id`), replace the single tabbed ledger with **per-currency account cards** (USD, EUR, LYD). Each card shows the balance for that currency, and clicking it expands to reveal that currency's ledger — with date filters and CSV export — matching the pattern already used in the consumer portal.

## Changes

### 1. `src/routes/app.accounts.$id.tsx` (rewrite the layout)

Replace the existing "Balances & debit limits" grid + "Ledger" tabs section with a single **stack of three currency cards** (one per USD / EUR / LYD).

Each card contains:
- **Collapsed header (always visible):**
  - Currency code (e.g. `USD`)
  - Current balance for that currency
  - Single-debit limit (with inline edit for admins, preserving the existing `BalanceCard` edit behavior)
  - Chevron up/down indicator
- **Expanded body (on click):**
  - Date filter chips: Any time / Today / 7d / 30d / Custom (date-range popover with From/To inputs)
  - CSV export button (filtered rows only)
  - `StatementLedger` component rendered with that currency's transactions, filtered by the chosen date range

Behavior:
- One card open at a time (toggle via local state), or independent toggles — independent matches portal pattern, use that.
- Reuse the existing `useQuery(["account.tx", id])` data; filter client-side per currency + date range with `useMemo`.
- Keep the existing balance/limit edit mutation (admins only) intact inside the collapsed header area.
- Keep the page header (account name, account number, phone, national ID, Back button) unchanged.

### 2. Shared helpers

- Reuse `StatementLedger` from `src/components/app/statement-ledger.tsx` as-is.
- Port the small `presetRange()` helper and `DateChip` UI bits from `src/routes/portal.tsx` (duplicate locally in the route file — small enough that extracting isn't worth a new module).
- Reuse `formatMinor` and `parseAmountToMinor` from `@/lib/format`.

### 3. No DB or schema changes

All filtering is client-side; no migrations, no RLS changes, no new tables.

## Out of scope

- No changes to the accounts list page (`app.accounts.index.tsx`).
- No changes to the consumer portal (already has this UX).
- No changes to translations beyond reusing existing `t("portal.*")` keys; if any new copy is needed it will be inline English (matching the rest of the staff detail page which is English-only).

## File touched

- `src/routes/app.accounts.$id.tsx` — rewrite balances + ledger section into expandable per-currency cards with date filters and CSV export.
