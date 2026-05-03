# DAHAB account-holder linking + Excel import

The Excel file you uploaded has **659 rows** with `Code`, `Nature`, `NameA`. About **553** end with a recognizable currency token (`$`, `€`, `£`, `دينار`, `يورو`, `باوند`); the remaining ~106 don't and will go to the review queue as `UNKNOWN`.

This plan adds a new account-holder layer on top of the existing schema, wipes the demo data, and builds the import + UI you described. It keeps the existing teller/vault/transactions flow working so the app doesn't break — the new tables sit alongside, not on top of, the current `accounts`/`ledger_entries`/`transactions` tables.

## Step 1 — Database migration

New tables (matching your spec, with `app_*` prefixes for ones that collide with existing names):

- `account_holders` — `id bigserial`, `dahab_account_number` unique, `canonical_name`, `normalized_name`, `holder_type` default `INDIVIDUAL`, `status` default `ACTIVE`, timestamps.
- `currencies` — seeded with `LYD`, `USD`, `EUR`, `GBP`, `UNK`.
- `holder_accounts` *(renamed from `accounts` to avoid colliding with the existing teller/vault `accounts` table)* — `account_number` unique, `account_holder_id`, `currency_code`, `account_nature`, `account_display_name` (raw NameA, never modified), `account_alias_name`, `is_primary_account`, `status`, timestamps.
- `account_name_aliases` — extra alias names per holder account.
- `holder_ledger_entries` — `account_id` → `holder_accounts.id`, `tx_number` unique, `posted_at`, `description`, `debit_amount`, `credit_amount`, `balance_after`, `currency_code`.
- `account_import_batches` — file metadata + counts + status.
- `account_import_staging` — every parsed row, with extracted currency, base name, normalized name, suggested holder, confidence, review_status.
- `account_link_review_queue` — uncertain rows for admin to resolve.
- Sequence `dahab_holder_seq` + helper function `next_dahab_account_number()` returning `DAHAB-000001`, `DAHAB-000002`, … (gap-free, unique, never reused).
- All indexes from your spec.
- **RLS**: enabled on all new tables. Read = any staff (admin / teller / auditor). Write = admin only. Holder-account read also allowed when the holder is mapped to the signed-in user (future-proofing for the consumer portal).

Existing tables left untouched so the rest of the app keeps compiling. The existing `accounts.kind = 'customer'` rows are conceptually replaced by `holder_accounts`; old code paths can be migrated incrementally in follow-ups.

## Step 2 — Wipe current data

You asked to delete the current data. I'll run a single destructive insert/delete (NOT a schema change) that empties:

- `transactions`, `ledger_entries`, `account_balances`, `transaction_attachments`
- `accounts` rows where `kind = 'customer'` (keeps the Cash/Bank/Wire vaults so the dashboard still works) — say the word and I'll wipe vaults too
- `notifications`, `audit_log`, `notification_reminders_state`

Auth users, roles, and profiles are kept so you can still log in. Reset is irreversible — I'll confirm one more time before executing.

## Step 3 — Excel parsing + import (server-side)

New server function `importAccountsFromXlsx` (TanStack `createServerFn`, admin-only via `requireSupabaseAuth` + `has_role` check):

1. Accepts the uploaded `.xlsx` as base64; parses with the `xlsx` npm package.
2. Reads the first sheet, expects columns `Code`, `Nature`, `NameA`. Trims, coerces `Code` to string, skips empty rows.
3. For each row:
   - `extracted_currency_code`: `$` → USD, `€`/`يورو` → EUR, `£`/`باوند` → GBP, `دينار` → LYD, else `UNK`.
   - `base_name_candidate`: NameA with the currency token stripped from the end.
   - `normalized_name_candidate`: trim, collapse spaces, strip punctuation, normalize Arabic (`أإآ→ا`, `ى→ي`, optional `ة→ه`), lowercase Latin.
   - `confidence_score`: 100 exact normalized match against existing holder, 90 after Arabic normalization, 70 fuzzy (Levenshtein-based), 50 if currency UNK.
4. Inserts a row in `account_import_batches` (status `PENDING`) and bulk-inserts all parsed rows into `account_import_staging`.
5. Routes rows with currency `UNK`, confidence < 80, or duplicate `account_number` collisions into `account_link_review_queue`.
6. Returns batch id + summary counts to the client.

A second server function `approveImportBatch(batchId)`:

- Groups staging rows by `normalized_name_candidate`.
- For each group: find or create an `account_holders` row (using `next_dahab_account_number()`), set `canonical_name = base_name_candidate`.
- Inserts a `holder_accounts` row per source row with `account_display_name = raw NameA exactly` and `account_alias_name = "{currency} Account"`.
- Skips rows still in the review queue.
- Updates the batch to `APPROVED` with final counts.

A third function `resolveReviewRow(rowId, decision)` for the review-queue UI: assign to existing holder, create new holder, edit canonical name, or reject.

## Step 4 — UI

New admin pages under `/app`:

- **`/app/import`** — Account Import.
  - Drag/drop `.xlsx` upload, calls `importAccountsFromXlsx`.
  - Preview table: total rows, valid, will-create-holder, will-link, needs-review, with detected currency, raw NameA, suggested holder, suggested DAHAB number, confidence.
  - Approve / Cancel buttons.
  - Import history list at the bottom (`account_import_batches`).
- **`/app/import/review`** — Review Queue.
  - List of pending rows with original NameA preserved.
  - Per-row actions: assign to existing holder (searchable), create new holder, edit canonical name, reject. Original `account_display_name` is read-only.
- **`/app/holders`** — Customer (holder) list.
  - Search by `dahab_account_number`, `canonical_name`, `normalized_name`, `account_number`, `account_display_name`, `account_alias_name`, alias table values.
  - Table: DAHAB number, canonical name, # linked accounts, status.
- **`/app/holders/$id`** — Holder detail.
  - Header: DAHAB number, canonical name, status.
  - Grid of clickable cards, one per linked account: currency, account number, original NameA (unmodified), nature, current balance.
  - Clicking a card expands that card's body and reveals **only** that account's ledger from `holder_ledger_entries` (Date, TX #, Description, Debit, Credit, Balance After) with date-range filter and CSV export. Other cards collapse. Ledgers never mix across cards or currencies.
- **`/app/transactions`** — extended search/filter:
  - Search across account name / account number / DAHAB number / tx number / amount.
  - Filters: from-date, to-date, currency, debit-or-credit, holder.

Sidebar in `app-shell.tsx` gets two new entries: **Account Import** and **Holders** (admin-visible).

## Step 5 — Style

Reuses the existing dark/gold DAHAB tokens (`card-luxe`, `text-gold`, gold-tinted borders) so the new pages match the current look. Cards use the same pattern already used on the staff Account Detail page.

## What's intentionally out of scope

- Merging the new `holder_accounts` model with the existing teller `post_transaction` RPC. The new ledger is read-only / import-fed for now; posting transactions still goes through the existing flow on the existing `accounts` table. We can unify them in a follow-up once the import is verified end-to-end.
- Touching `auth`, `storage`, `realtime`, or other reserved schemas.

## Files I'll add or change

- Migration: new tables, indexes, sequence, helper function, RLS policies, currencies seed.
- Data wipe: separate destructive insert step (run after you re-confirm).
- `src/server/imports.functions.ts` — `importAccountsFromXlsx`, `approveImportBatch`, `resolveReviewRow`, `searchHolders`.
- `src/server/imports.server.ts` — xlsx parsing, currency detection, normalization, confidence scoring (server-only).
- `src/routes/app.import.tsx`, `src/routes/app.import.review.tsx`.
- `src/routes/app.holders.index.tsx`, `src/routes/app.holders.$id.tsx`.
- Updates to `src/routes/app.transactions.index.tsx` (filters/search).
- `src/components/app/app-shell.tsx` — sidebar entries.
- `src/lib/i18n/en.ts` + `ar.ts` — new strings.
- `bun add xlsx`.

## Confirmations I need before running

1. **Wipe scope** — okay to delete all customer accounts + balances + transactions + ledger + notifications + audit, but keep auth users, roles, and the Cash/Bank/Wire **vaults**? Or wipe vaults too?
2. **`UNK` currency rows** (~106 in your file) — auto-route to the review queue, correct?
3. **Existing teller flow** — leave it on the old `accounts` table for now and migrate later, or block it until the new model takes over?