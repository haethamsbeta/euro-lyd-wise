
## Goal

Make Holder Accounts a first-class, paginated, searchable browse page backed by `GET /holder-accounts`, with correct row navigation to `/app/accounts/:id`, while keeping the existing design and the holder-detail "linked accounts" summary section intact. Additionally, surface the linked-account count on holder cards.

## Scope of changes (frontend only)

### 1. Adapter — `src/lib/api/accounts.ts` + alias `holderAccounts`

- Update `accountsApi.list(params)` to:
  - Forward `q`, `currency`, `status`, `limit`, `offset` via `qs(params)`.
  - Always return `{ items, total, limit, offset, next_offset }`.
  - **Do not swallow errors.** No `.catch(() => [])` upstream.
- Keep `accountsApi.get(id)` and `accountsApi.ledger(id, { limit, offset, from, to })` as-is.
- In `src/lib/api/index.ts`, alias the same object as `holderAccounts` so `api.holderAccounts.list(...)` works.

### 2. Holder Accounts page — `src/routes/app.accounts.index.tsx`

Keep existing visual structure; rewrite logic to add server-driven pagination, search, and filters:

- State: `q` (debounced 300 ms), `currency` (LYD/USD/EUR/GBP/null), `status` (active/closed/null), `pageSize` (50 default; allow 50 and 100), `offset` (resets to 0 when q/currency/status/pageSize change).
- Query: `api.holderAccounts.list({ limit: pageSize, offset, q, currency, status })` with `keepPreviousData`. Show errors inline.
- Filter UI inside existing layout: search input, currency chips, status chips, page-size selector.
- Pager: `Showing X–Y of {total}` using backend `total` + `next_offset`. Remove "Pagination coming soon" copy.
- Rows link to `/app/accounts/$id` using `account.id` (never `account_holder_id`).
- Currency: render `CurrencyBadge` only for LYD/USD/EUR/GBP; otherwise show "Currency missing".
- Row fields: holder_name, holder_dahab_account_number, account_number, dahab_account_number, account_display_name, currency_code, account_nature, current_balance, available_to_withdraw, withdraw_limit_enabled flag, linked_ledger_count (when present), status.

### 3. Holder cards — `src/routes/app.holders.index.tsx`

- On each holder card, add a small badge/line showing the number of linked accounts for that holder, e.g. `{h.holder_accounts.length} linked accounts`. Use the count already available in the holders list payload (`holder_accounts` / `accounts` array length); no extra fetch.
- No layout redesign — slot the count under the existing currency-chip row or next to the status badge.

### 4. Holder detail — `src/routes/app.holders.$id.tsx`

- Keep linked-accounts section (design unchanged).
- Add small "View all linked accounts" link → `/app/accounts?q={holder_dahab_account_number}`.
- Verify each linked-account card links to `/app/accounts/$id` with `account.id`.

### 5. Account detail — `src/routes/app.accounts.$id.tsx`

- No changes beyond confirming `api.accounts.get(id)` + `api.accounts.ledger(id, ...)` and the "No ledger activity for this account." empty state already work.

### 6. Sidebar / navigation

- "Linked Accounts" entry already added in a previous turn; leave intact.

## Out of scope

- No backend changes.
- No Supabase fallback in lambda mode for the list query.
- No redesign of cards, hero, or holder detail.
- No mock data, no removed sections.

## Acceptance verification

In preview after changes:
- `/app/accounts` shows 50 rows, "Showing 1–50 of 659", Next → 51–100.
- Search "ahmed" sends `q=ahmed`, total updates, offset resets to 0.
- Currency LYD and Status Active filter server-side.
- Row click opens `/app/accounts/:holderAccountId`.
- Account detail loads + ledger renders, or shows empty-state message.
- Holder cards show linked-account count.
- `bunx tsc --noEmit` passes.
