## What's already built

The previous turn shipped most of the spec: tables (`account_holders`, `holder_accounts`, `currencies`, `account_name_aliases`, `holder_ledger_entries`, `account_import_batches`, `account_import_staging`, `account_link_review_queue`), the `next_dahab_account_number()` sequence, the `approve_import_batch()` RPC, RLS policies, `/app/import` upload + preview + approve UI, and `/app/holders` list. The DB is currently empty (0 holders, 0 staging, 0 batches), so nothing has been imported yet.

## What's missing / broken vs. your spec

1. **`/app/holders/$id` route doesn't exist** — clicking a holder card on `/app/holders` 404s. This is the page with clickable currency cards + per-card ledger.
2. **No review-queue UI** — uncertain rows (UNK currency, low confidence, duplicate account #) are written to `account_link_review_queue` but admins can't act on them.
3. **Transactions page not extended** — search by DAHAB #, holder name, currency filter, date range, debit/credit toggle still missing on `/app/transactions`.
4. **Currencies seed not verified** — need to confirm LYD/USD/EUR/GBP/UNK rows exist; if not, the FK on `holder_accounts.currency_code` will reject inserts on approve.
5. **Sidebar `Account Import` entry exists but no `Review Queue` entry.**
6. **You re-uploaded `Almizan_Acc_Table-2.xlsx`** — once the above is done, run the import end to end against this file.

## Plan

### Step 1 — Fill the gaps in DB

Migration: ensure currencies seed (`LYD`, `USD`, `EUR`, `GBP`, `UNK`) is present (idempotent insert). Add a small RPC `resolve_review_row(p_row_id, p_decision jsonb)` so the review UI can: assign-to-existing-holder, create-new-holder, edit-canonical-name, reject. Add unique index on `holder_accounts.account_number` if not present (your spec calls for it; prevents duplicates).

### Step 2 — `/app/holders/$id` (new route)

`src/routes/app.holders.$id.tsx`:

- Header: DAHAB #, canonical name, status.
- Grid of cards, one per `holder_accounts` row: currency badge, account #, **original `account_display_name` shown unchanged (RTL)**, nature, current balance.
- Click a card → that card expands; others collapse. Inside the expanded card, render a ledger table from `holder_ledger_entries` filtered by `account_id` only: Date, TX #, Description, Debit, Credit, Balance After. Date-range filter + CSV export.
- Never mix currencies. Never render the ledger outside the active card.

### Step 3 — `/app/import/review` (new route)

`src/routes/app.import.review.tsx`, admin-only:

- Lists pending rows from `account_link_review_queue` with original `raw_name` shown read-only.
- Per row: search-and-pick existing holder, "create new holder" (with editable canonical name; default = `base_name_candidate`), edit suggested currency for UNK rows, reject. All actions go through `resolve_review_row` RPC.
- After resolution, the staging row is flipped back to `PENDING` so the next "Approve import" sweep links it.

### Step 4 — Sidebar + i18n

Add `Review Queue` link under Account Import in `src/components/app/app-shell.tsx`, plus EN + AR strings.

### Step 5 — Extend `/app/transactions`

Update `src/routes/app.transactions.index.tsx`:

- Add search input that matches across `tx_number`, customer account name, customer account #, **DAHAB # (via join through `accounts.account_number` ↔ `holder_accounts.account_number` ↔ `account_holders`)**, amount.
- Filters: from-date, to-date, currency dropdown, direction (deposit=credit / withdraw=debit), holder picker.

Note: existing `transactions` table still references the legacy `accounts` table (vault flow). The DAHAB # join is a soft enrichment — if no `holder_accounts` row matches the customer account number, transactions still show, just without a DAHAB badge.

### Step 6 — Run the import

After the code lands, open `/app/import`, drop `Almizan_Acc_Table-2.xlsx`, verify the preview counts (~553 valid, ~106 review for UNK currency), approve. Spot-check a holder like "ابراهيم الككلي" on `/app/holders` to confirm 2–4 currency cards link under one DAHAB number, and clicking each card shows an empty ledger (no transactions yet — that's expected, ledgers are import-fed).

## Files I'll add or change

- `supabase/migrations/<new>.sql` — currencies seed (idempotent), `resolve_review_row` RPC, missing unique index.
- `src/routes/app.holders.$id.tsx` *(new)*
- `src/routes/app.import.review.tsx` *(new)*
- `src/routes/app.transactions.index.tsx` *(edit)*
- `src/components/app/app-shell.tsx` *(edit — sidebar)*
- `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts` *(edit — new strings)*

## Out of scope

- Wiring posted teller transactions into `holder_ledger_entries` automatically. The new ledger remains import/admin-fed for now (you confirmed leave the teller flow on the legacy `accounts` table).
- Merging two existing holders post-hoc — the review queue handles uncertain matches up front, but a manual "merge holders" tool isn't in this pass.

## Confirm before I run

1. OK to add a hard unique index on `holder_accounts.account_number`? (Spec requires it, current table has no unique constraint.)
2. After this lands, want me to auto-run the import on the uploaded file, or stop after the code is in so you click Approve yourself?