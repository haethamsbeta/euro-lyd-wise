# Make accounts in Dashboard & Vaults clickable

## Goal
From the Dashboard and Vaults pages, every account/vault tile (and recent transaction row on the Dashboard) should be clickable and navigate to a detail page that lists all transactions for that account/vault.

The good news: detail pages already exist and already render full transaction history.
- `src/routes/app.vaults.$id.tsx` — vault detail with balances + transactions table
- `src/routes/app.accounts.$id.tsx` — customer account detail with balances + ledger

The Vaults list cards are already wrapped in `<Link>`. What's missing is making the **Dashboard** interactive, plus a couple of small UX touches.

## Changes

### 1. Dashboard — vault currency tiles become clickable (`src/routes/app.index.tsx`)
Each of the three currency tiles (USD/EUR/LYD) on the dashboard summarizes Cash + Bank vaults for that currency. We'll make the **Cash Vault** row and **Bank Vault** row inside each tile individually clickable, navigating to the matching `/app/vaults/$id` page.

To do this, pre-compute a lookup of vault accounts by `(channel, currency_present)` from the existing `data.accounts` query (no new requests). Each "Cash Vault" / "Bank Vault" row becomes a `<Link>` that highlights on hover with the existing gold accent.

Fallback: if no vault account is found for that channel, render the row as plain text (current behavior).

### 2. Dashboard — recent transaction rows become clickable (`src/routes/app.index.tsx`)
The recent transaction items already include enough info but the underlying `transactions` query doesn't return `customer_account_id`. Add `customer_account_id` to the select, then wrap each list item in a `<Link to="/app/accounts/$id" params={{ id: tx.customer_account_id }}>`. Keep the existing layout (icon, tx number, amount, status badge) but add hover styling.

### 3. Vaults list — keep current behavior, polish (`src/routes/app.vaults.tsx`)
Already clickable. Add a small "View transactions →" affordance in the card footer so the click target is obvious.

### 4. Vault detail — already done (no change)
Confirmed it lists every transaction posted against that vault, with each customer name linked through to that customer's account detail (where their full ledger is visible).

## Out of scope
- No DB schema changes.
- No new routes — both detail pages already exist.
- No i18n string additions required (existing labels are reused).

## Files to edit
- `src/routes/app.index.tsx` — clickable vault rows + clickable recent tx rows (+ add `customer_account_id` to query select)
- `src/routes/app.vaults.tsx` — small "View transactions →" hint inside each card

## Acceptance
- Clicking the Cash Vault or Bank Vault row inside a currency tile on the Dashboard opens that vault's detail page with its transaction history.
- Clicking any row in "Recent transactions" on the Dashboard opens the customer account detail page showing that account's full ledger.
- Clicking a vault card on the Vaults page opens its detail page (already works) and the affordance is visually clearer.
