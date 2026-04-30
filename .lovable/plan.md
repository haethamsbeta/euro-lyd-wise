# Fix: Transactions page crash — "Cannot read properties of undefined (reading 'map')"

## Root cause

The transactions list page (`/app/transactions`) selects three columns that **do not exist in the database**:

- `reverses_tx_id`
- `corrected_by_tx_id`
- `correction_reason`

These columns (and the `reversed` value of the `tx_status` enum, plus the `correct_transaction` RPC) were added to the codebase in migration `20260430003335_add_correct_transaction.sql` for the admin "Edit entry" feature, but **the migration was never actually applied** to the live database. I confirmed via `psql`:

- The three columns are missing from `public.transactions`.
- The `tx_status` enum only has `posted`, `pending`, `rejected` (no `reversed`).

So the Supabase query returns an error, `data` stays `undefined`, and the component then calls `data!.map(...)` which throws the `Cannot read properties of undefined (reading 'map')` error shown in the screenshot.

(Side note: the user mentioned the "accounts page" but the stack trace and current route show this is actually the **Transactions** page — `/app/transactions`. The Accounts page is unaffected.)

## Fix

### 1. Re-apply the correction migration to the database

Re-run the SQL from `supabase/migrations/20260430003335_add_correct_transaction.sql` as a fresh migration so the schema actually reflects the code:

- Add `'reversed'` to the `tx_status` enum (idempotent).
- Add `reverses_tx_id`, `corrected_by_tx_id`, `correction_reason` columns to `public.transactions`.
- Recreate indexes and the `public.correct_transaction(...)` RPC.

All statements use `IF NOT EXISTS` / `CREATE OR REPLACE`, so re-running is safe.

### 2. Make the transactions list resilient to query failures

In `src/routes/app.transactions.index.tsx`, update the `useQuery` usage so a future schema mismatch can't crash the whole route:

- Pull `error` out of `useQuery` and render an inline error state (Alert) instead of letting the error bubble to the route boundary.
- Replace `data!.map(...)` with a safe `(data ?? []).map(...)` so the renderer never dereferences `undefined`.
- Keep the existing loading and empty states.

No UI/feature changes — the table looks and behaves the same once the migration is applied; it just degrades gracefully if a query ever fails again.

## Files touched

- New: `supabase/migrations/<timestamp>_reapply_correct_transaction.sql` — same body as the existing correction migration, idempotent.
- Edited: `src/routes/app.transactions.index.tsx` — handle `error`, guard against undefined `data`.

## Out of scope

- No changes to the Accounts page, the entry form, attachments, or the correction RPC logic itself.
