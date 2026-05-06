# Holder Creation Fix + Auto-Generated Account Numbers + Group Balance Totals

## 1. Root cause of the duplicate-key error

`account_holders` has 408 rows ending at `DAHAB-000408`, but the underlying `dahab_holder_seq` sequence is only at value **2** (rows were imported via Excel, bypassing `nextval`). The next call to `next_dahab_account_number()` returns `DAHAB-000003`, which already exists, hence:

> duplicate key value violates unique constraint "account_holders_dahab_account_number_key"

A new sequence is also needed to back auto-generated linked-account numbers.

## 2. Database migration

1. **Realign the holder sequence** to current max:
   `setval('dahab_holder_seq', GREATEST(<max parsed from existing DAHAB-XXXXXX>, last_value))`.
2. **Harden `next_dahab_account_number()`** so it loops until it returns a value not already present in `account_holders` (defense against future drift / concurrent imports).
3. **Create `holder_account_number_seq`** plus helper `next_holder_account_number(p_dahab text, p_currency text)` returning e.g. `DAHAB-000409-USD-001`, also collision-checked.
4. **Update `create_holder_with_accounts(...)` and `add_account_to_holder(...)`**:
   - Stop requiring `account_number` from the client.
   - When `account_number` is omitted/blank, auto-generate via the new helper.
   - Continue to accept an explicit number (preserves Excel import flow).

No table schema changes — only sequences + functions.

## 3. Frontend: holder dialogs (clearer + auto-gen)

### `src/components/app/new-holder-dialog.tsx`
- Remove the **Account number** input. Add inline note: "Account number is generated automatically (e.g. DAHAB-000409-USD-001)."
- Restyle the "Linked accounts" section: gold-accented sub-header, helper line, larger Add button labeled "Add linked account".
- Each staged row gets a check icon and clearer chips (currency, nature, display name).
- When ≥1 account is staged, show a green confirmation banner: "1 linked account ready — add more or create the holder."
- Drop `account_number` from the staged payload (server generates it).

### `src/components/app/add-linked-account-dialog.tsx`
- Same: remove the account-number input, add the auto-gen note, keep currency / nature / display / alias.

## 4. Holder created-at timestamp

- `src/routes/app.holders.$id.tsx`: show `holder.created_at` formatted as full date + time (locale-aware) in the holder header card.
- `src/routes/app.holders.index.tsx`: include the created timestamp in the holder card subtitle.

## 5. Group balance totals — more visible and elegant

### Group card (`src/routes/app.groups.index.tsx`)
Replace the small per-currency rows with an elegant **totals strip**:
- Prominent gold "Total balances" label.
- One pill per currency stacked horizontally (wraps): currency code badge + large gold-toned amount + tiny "X acct" caption.
- Subtle gold gradient background and divider above the strip.
- Member count badge stays in header.
- Empty state: muted "No balances yet."

### Group detail page (`src/routes/app.groups.$id.tsx`)
Add a **summary banner** above the existing per-currency cards:
- Full-width card with gold gradient border.
- Heading "Group balance totals" + "across N accounts".
- Inline horizontal list of currency pills (same component used on the card) with the largest balance highlighted.
- Existing detailed per-currency cards (debits/credits breakdown) remain underneath, slightly smaller, as the deep-dive view.

Implementation: extract a shared `<CurrencyTotalsStrip totals={...} />` component in `src/components/app/currency-totals-strip.tsx` so both pages render identical pills.

## 6. Files touched

- New migration in `supabase/migrations/` (sequence reset + new helper + 2 RPC updates).
- `src/components/app/new-holder-dialog.tsx`
- `src/components/app/add-linked-account-dialog.tsx`
- `src/routes/app.holders.$id.tsx`
- `src/routes/app.holders.index.tsx`
- `src/routes/app.groups.index.tsx`
- `src/routes/app.groups.$id.tsx`
- New: `src/components/app/currency-totals-strip.tsx`

## Out of scope

- AWS backend wiring (still scaffolding-only per earlier decision).
- Schema changes to `account_holders` / `holder_accounts` (only sequences + functions).
