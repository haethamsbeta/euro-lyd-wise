## Heads up about the uploaded file

You called it `dahabdetasheetlinkedaccounts.xlsx` in the prompt, but the actual file you uploaded is **Apple Numbers** (`.numbers`), not Excel. Two ways forward — pick one:

- **A (recommended)**: re-export from Numbers as `.xlsx` and re-upload. Faster, no extra dependency, and matches the existing import UI which already accepts `.xlsx`.
- **B**: I add the `numbers-parser` Python/JS package and a server-side conversion step. Heavier, and Numbers→tabular conversion can lose merged cells / grouped headers.

I'll assume **A** for the plan below. If you want B, say so and I'll add the conversion step.

## What changes vs. what's already built

The current importer (`src/lib/account-import.ts` + `approve_import_batch` RPC) **derives** DAHAB numbers by normalizing Arabic names and grouping. Your new file makes that obsolete: the file itself is the source of truth — it already says which bank accounts share a DAHAB number.

So the new ingestion path must:

1. Trust `dahab_account_number` from the file as-is.
2. Create the holder once per DAHAB number (don't re-group by name).
3. Attach every row underneath as a `holder_accounts` record, keeping `account_display_name` byte-for-byte from the sheet (no stripping `$`, `يورو`, `دينار`, `باوند`).
4. Skip / report (not silently merge) any row whose DAHAB # already has a child account with the same `account_number`.

## Plan

### Step 1 — DB

New migration:

- Add `dahab_account_number` column to `holder_accounts` (denormalized copy from the parent — makes search-by-DAHAB-# trivial and matches your spec's "accounts" table fields).
- New RPC `import_linked_accounts_batch(p_batch_id bigint)` that reads staging rows and:
  - upserts `account_holders` keyed by `dahab_account_number` (canonical_name = first non-empty name in that group; normalized_name only for search).
  - inserts `holder_accounts` with `account_display_name` preserved verbatim, `currency_code` from the row, `account_nature` from the row.
  - bumps `dahab_holder_seq` past the max numeric suffix found in the file so future auto-generated DAHAB #s don't collide.
- Add staging columns we don't have yet: `dahab_account_number`, `account_alias_name`, `is_primary_account`. (Existing `account_import_staging` is keyed to the old name-grouping flow.)

### Step 2 — Parser (`src/lib/account-import.ts`)

Add a second parser `parseLinkedAccountsWorkbook(buf)` that:

- Reads the **Flat Import Table** sheet by name (falls back to first sheet if absent).
- Required columns: `dahab_account_number`, `account_number`, `currency_code`, `account_nature`, `account_display_name`. Optional: `account_alias_name`, `is_primary_account`, `canonical_name`.
- No name normalization on `account_display_name`. Normalize only the holder's canonical name for search.
- Validates: DAHAB # format `DAHAB-\d{6}`, currency in {LYD, USD, EUR, GBP, UNK}, account_number non-empty.
- Flags rows for review only on validation failure or unknown currency — never on name-similarity heuristics.

### Step 3 — Import UI (`src/routes/app.import.tsx`)

Add a mode toggle at the top: **"Linked accounts file (pre-grouped)"** vs. the existing **"Raw bank export (auto-group)"**. Default to the new mode. Preview shows: # holders, # linked accounts, per-currency counts, validation errors, and the first 20 rows grouped by DAHAB # so you can eyeball it before approving.

Approve calls `import_linked_accounts_batch` instead of `approve_import_batch`.

### Step 4 — Holder profile (`src/routes/app.holders.$id.tsx`)

Already does cards-per-currency + per-card ledger. Two small fixes:

- Show `dahab_account_number` on each card (you asked for searchability by DAHAB #).
- Make sure ledger query stays `eq("account_id", a.id)` — already correct, just double-checking it doesn't accidentally union across linked accounts.

### Step 5 — Search

`/app/holders` search already covers name + DAHAB # + account #. Add `account_display_name` ilike match (currently only `account_number` and a normalized field). Add a currency filter chip.

### Step 6 — Run the import

After code lands and you re-upload the `.xlsx`: open `/app/import`, pick **Linked accounts**, drop the file, verify counts match what you expect (one holder per DAHAB #, N child accounts), approve. Spot-check `DAHAB-000001` → 4 cards (LYD/USD/EUR/GBP), names unchanged including the `$` / `يورو` / `دينار` / `باوند` suffixes.

## Files

- `supabase/migrations/<new>.sql` — new columns + new RPC
- `src/lib/account-import.ts` — add `parseLinkedAccountsWorkbook`
- `src/routes/app.import.tsx` — mode toggle, new preview, new approve call
- `src/routes/app.holders.index.tsx` — add display-name search + currency filter
- `src/routes/app.holders.$id.tsx` — show DAHAB # on cards (small)

## Out of scope

- Auto-wiring teller transactions into `holder_ledger_entries` (still admin/import-fed; you confirmed earlier).
- A "merge two DAHAB holders" tool. The file is authoritative; if two DAHAB #s should be one, fix the file and re-import.

## Confirm

1. Re-upload as `.xlsx` (option A), or have me add Numbers parsing (option B)?
2. On re-import of a DAHAB # that already exists in the DB: **upsert/update** the holder + add new accounts, or **reject** and require an explicit "wipe holders" first?
