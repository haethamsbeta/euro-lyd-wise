## Goal

In **New Transaction → Deposit** and **Withdraw**, let the teller find the customer by **DAHAB account number** (e.g. `DAHAB-000139`) in addition to name and linked account number, then pick a specific currency card to post against.

## Background (important)

The customer picker today queries the legacy `accounts` table (kind=`customer`). That table currently has **0 customer rows** — all real customer data lives in `account_holders` (DAHAB # + canonical name) and `holder_accounts` (per-currency linked accounts). However, the `post_transaction` RPC still requires a `uuid` from `accounts`, so we need a small bridge.

## Changes

### 1. `src/components/app/entry-form.tsx` — search & picker

- Replace the `accounts` query with a search across:
  - `account_holders` on `dahab_account_number` and `canonical_name` / `normalized_name`
  - `holder_accounts` on `account_number` (linked card number)
- Show results grouped per holder: **DAHAB # · Name**, with a sub-list of their currency cards (currency + linked account # + current balance from `holder_accounts.current_balance`).
- The teller picks **one currency card** (a `holder_accounts` row). The chosen card determines the `currency` automatically (so the currency selector becomes display-only / locked once a card is chosen).
- Keyboard shortcut "/" still focuses the search; placeholder updated to `Search by DAHAB #, name, or account #…`.

### 2. Bridge holder card → legacy `accounts` row

`post_transaction` needs a `customer_account_id uuid` from `public.accounts`. On submit:

- Look up `accounts` by `account_number = <picked card account_number>`.
- If missing, insert one (`kind='customer'`, `nature` from `holder_accounts.account_nature`, `name` = holder canonical name, `account_number` = card number).
- Use that uuid in the existing `supabase.rpc("post_transaction", …)` call.

This is done via a new SECURITY DEFINER RPC `ensure_customer_account_for_holder_account(p_holder_account_id bigint) returns uuid` so a single round-trip handles lookup-or-create with proper RLS. Restricted to `admin`/`teller`.

### 3. Balance preview

Replace the `account_balances` query (keyed on legacy account uuid) with the picked `holder_accounts.current_balance` for the chosen currency. Overdraft / pending logic stays the same (compares amount to current balance; still respects `account_balances.debit_limit_minor` after the bridge row is created — defaults to 0, i.e. no extra limit).

### 4. Ledger preview line

Show `DAHAB-XXXXXX · Holder Name (CUR ####)` instead of just the legacy account name.

## Files touched

- `src/components/app/entry-form.tsx` — search query, picker UI, submit flow, balance source.
- `supabase/migrations/<new>.sql` — add `ensure_customer_account_for_holder_account` RPC.

## Out of scope

- No changes to `app.transactions.new.deposit.tsx` / `…withdraw.tsx` route shells (they just render `<EntryForm/>`).
- No change to `post_transaction` itself.
- Vault selection logic unchanged.
