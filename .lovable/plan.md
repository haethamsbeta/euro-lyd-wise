# DAHAB — Improvements & Fixes

Scope covers the 6 requested items while preserving the dark/gold luxury identity, banking layout, and DAHAB branding. Mobile and desktop will both be addressed.

## 1. Consumer portal — separate currency cards + per-account ledger

The customer portal at `/portal` currently shows one card per (account, currency) but the ledger below mixes everything together. We will:

- Replace the cards with one **clickable** premium card per currency the customer holds (LYD, EUR, USD, GBP*).
- Each card shows: currency code (large gold), current balance, account number, last activity timestamp, and a subtle "View ledger →" hint.
- Clicking a card opens a dedicated route `/portal/$accountId/$currency` showing ONLY that currency's ledger for that account.
- The single combined ledger below is removed in favor of the per-currency view.

> *GBP note:* the database `currency_code` enum currently allows `USD`, `EUR`, `LYD` only. Adding `GBP` requires extending the enum (a tiny migration) **and** seeding a Cash/Bank vault for GBP — otherwise transactions in GBP cannot be posted. The plan assumes you want this; if not, GBP cards will only render when a customer actually holds a GBP balance and we'll skip the migration.

## 2. Bank-statement style ledger with running balance

The new per-currency ledger (used in both `/portal/$accountId/$currency` and the staff `/app/accounts/$id` view) becomes a true bank statement:

| Date & time | TX # | Description | Debit | Credit | Balance after |
|---|---|---|---|---|---|

- Only `posted` and `reversed` rows are included in the running total (pending/rejected shown but not counted, with a muted style).
- Running balance is computed client-side from the **oldest → newest** ledger entries for the customer/currency, then displayed newest-first.
- The "Description" column uses the existing `describeTx()` helper for human-readable text.
- Works for staff `Account detail → Ledger` too (same component reused).

## 3. Transactions page — search + date filtering

`/app/transactions` currently searches by TX number only. Upgrade the filter bar to:

- **Search input** (debounced) matches against: `tx_number`, `customer.name`, `customer.account_number`, and amount (typed as `12.50` → minor units).
- **Date filter** with three controls in one popover:
  - Quick chips: Today · This week · This month · Last 30 days · All time
  - From / To date pickers (using existing `Input type="date"`)
- Combined client+server query: server filters by date range and limit; client narrows by free-text and existing direction/status/files toggles.
- Clear empty state ("No transactions match your filters — try widening the date range or clearing search").
- All filters URL-synced via TanStack search params so a filtered view is shareable.

## 4. Landing page navigation — strict portal separation

`/` already routes both CTAs to `/login` with a `?portal=staff|consumer` param, but it can be confusing because the single login page hosts both. We will:

- Keep the two distinct CTA cards on the landing page (DAHAB Family, Customer Portal).
- On `/login` enforce the chosen portal: hide the portal switcher chips when arrived from the landing CTAs (still accessible via direct link with `?switch=1`), and hard-block role mismatches (already done) with clearer messages and a "Go to correct portal" button.
- Update header CTA so the small "Sign in" button in the landing header explicitly goes to the **Family** portal and adds a secondary "Customer" link next to it.
- Verify session restore: a logged-in consumer landing on `/login?portal=staff` is redirected back to `/portal`, and vice versa.

## 5. Customizable dashboard

The staff dashboard at `/app` has fixed Cash Vault / Bank Vault / Customers tiles per currency. We will:

- Add a **"Customize dashboard"** button (gear icon) that opens a sheet listing every account: Cash Vault USD/EUR/LYD, Bank Vault USD/EUR/LYD, Wire Vault, plus all customer accounts grouped under "Customers".
- Each row has a switch (Show / Hide on dashboard).
- Selections are saved per-user. Storage approach: **`localStorage` keyed by user id** (no migration needed, instant). If you'd like cross-device persistence we can layer a `dashboard_preferences` table later.
- The currency tiles re-render based on the visible set: hidden vaults are removed, customer total tile only includes visible customer accounts.
- Default = current behavior (everything visible) so existing users see no change until they customize.

## 6. Approvals page — fix accept/decline UX

`/app/approvals` uses `window.prompt` for the reject reason which is blocked in some embedded previews and returns `null`, causing the action to silently no-op. The RPC itself works. We will:

- Replace `window.prompt` with a proper Reject dialog: textarea + "Reason required" validation + Cancel/Confirm buttons.
- Disable Approve/Reject buttons during the in-flight mutation and show a spinner.
- Show success toast + optimistic removal from the list; on error show the actual Postgres message in a destructive toast and an inline alert above the row.
- Tighten `invalidateQueries` to specific keys (`approvals`, `dashboard`, `transactions.list.v2`) so the UI updates everywhere.
- Empty state already exists; loading skeletons added.
- Confirm RLS/role: only admins can call the RPC (already enforced server-side); the page already wraps in `RoleGate allow=["admin"]`.

## Technical details

**New / changed files**
- `src/routes/portal.tsx` — split into per-currency card grid; remove combined ledger.
- `src/routes/portal.$accountId.$currency.tsx` *(new)* — per-account ledger.
- `src/components/app/statement-ledger.tsx` *(new)* — shared bank-statement table with running balance.
- `src/routes/app.accounts.$id.tsx` — use shared statement ledger; add per-currency tabs.
- `src/routes/app.transactions.index.tsx` — broaden search, add date popover & quick chips, URL search-param sync.
- `src/routes/index.tsx`, `src/routes/login.tsx` — landing CTAs explicit; login enforces portal lock when `lock=1` query present.
- `src/routes/app.index.tsx` — add Customize sheet, per-user `localStorage` visibility, filtered tiles.
- `src/components/app/dashboard-customize.tsx` *(new)* — sheet UI.
- `src/routes/app.approvals.tsx` — replace `window.prompt` with `<Dialog>`, loading/disabled states, scoped invalidation.
- `src/lib/i18n/en.ts` + `ar.ts` — new translation keys.

**Migration (only if GBP is requested)**
```sql
ALTER TYPE public.currency_code ADD VALUE IF NOT EXISTS 'GBP';
-- + seed cash/bank GBP vaults via _upsert_vault
```

**Running-balance algorithm**
1. Query all ledger entries for `(customer_account_id, currency)` ordered ascending.
2. Walk forward, accumulating `+credit / -debit` (respecting account `nature`).
3. Reverse for display so newest is on top, but each row carries its computed `balance_after`.

**Open questions before implementation**
- Add GBP enum + seed vaults? (otherwise GBP card only appears if the customer already has a GBP balance row)
- Persist dashboard customization in DB (cross-device) or `localStorage` only? Plan defaults to `localStorage`.
