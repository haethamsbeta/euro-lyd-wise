
# Align UI to existing DAHAB data model

No tables will be renamed. We keep the current schema names
(`account_holders`, `holder_accounts`, `holder_ledger_entries`) and treat
them as the canonical feeders for everything you described. Only the
**customer portal**, **back-office holder views**, and a couple of
**search/profile fields** change.

## Mapping (your spec → existing tables, unchanged)

- DAHAB account → `account_holders`
  (`dahab_account_number`, `canonical_name` = display, `normalized_name`,
  `status`, + new `phone`, `email`)
- Linked holder account → `holder_accounts`
  (`account_number`, `account_display_name` = original name, `currency_code`,
  `current_balance`, `status`)
- Transactions → `holder_ledger_entries`
  (`tx_number`, `posted_at`, `description`, `debit_amount`, `credit_amount`,
  `balance_after`, keyed by `account_id` = holder_account_id)

## 1. Tiny additive migration

- `account_holders`: add nullable `phone text`, `email text` + indexes.
- Partial unique index enforcing **one active DAHAB per customer**:
  `(owner_user_id) where owner_user_id is not null and status = 'ACTIVE'`.
- Extend `create_holder_with_accounts` RPC to accept optional
  `p_phone`, `p_email`.
- New `get_holder_currency_totals(p_holder_id bigint) returns jsonb` —
  sums `current_balance` per `currency_code` for that holder.

No table renames, no destructive changes.

## 2. Customer portal rewrite (`/portal`)

Replace the legacy `accounts` / `transactions` queries with the holder
model. Top of page = profile card:

- DAHAB number, display holder name, status badge
- Total balance summary grouped by currency (from
  `get_holder_currency_totals`)

Below = **dynamic** grid of all `holder_accounts` rows for that holder.
Nothing hardcoded by currency — N USD / N LYD / etc. all render.

Each card shows: original account name (`account_display_name`), original
account number, currency, current balance, status.

Clicking a card expands the ledger **inline directly under that card**
(accordion). Ledger query:
`holder_ledger_entries.eq('account_id', holder_account_id)` — never by
DAHAB number, so accounts never bleed into each other.

Ledger columns: date (`posted_at`), tx number, description, debit, credit,
running balance (`balance_after`).

Delete `src/routes/portal.$accountId.$currency.tsx` (replaced by inline
expansion).

## 3. Back-office holder views

`/app/holders` (list): one card per DAHAB with linked-account chips
(already correct). Add `phone` / `email` to the search `or(...)`.

`/app/holders/$id` (detail):
- Header gains the per-currency totals strip from
  `get_holder_currency_totals`.
- Holder-account cards already expand inline into a per-account ledger
  keyed by `account_id` — keep, just promote `account_display_name` as
  the prominent label and show `account_alias_name` underneath.
- New admin-only **Account-link review** section listing this holder's
  rows from `account_link_review_queue` (raw imported name, normalized
  candidate, confidence) with Approve / Reject calling the existing
  `resolve_review_row` RPC. Satisfies "inspect why accounts were linked".

## 4. Search

- Holders: extend existing `or` with `phone.ilike`, `email.ilike`.
- Holder accounts: search by `account_number`, `account_display_name`,
  `currency_code`, balance range (numeric pair).
- `/app/transactions`: filter form over `holder_ledger_entries` by
  tx_number, joined account name/number, currency, amount min/max,
  date range.

## 5. Routing / entry flows

`/` already splits Dahab Family (staff) vs Customer Portal (consumer)
via `?portal=staff|consumer&lock=1`. Verify `login.tsx` honors `lock=1`
and patch if it doesn't, so the two flows can never mix.

## Files

**New**
- `supabase/migrations/<ts>_holder_profile_fields.sql` — phone/email
  columns, unique-active-DAHAB index, updated
  `create_holder_with_accounts`, new `get_holder_currency_totals`.
- `src/components/app/link-review-panel.tsx` — admin link-review queue UI.

**Edited**
- `src/routes/portal.tsx` — rewritten against `account_holders` /
  `holder_accounts` / `holder_ledger_entries` with inline ledger.
- `src/routes/portal.$accountId.$currency.tsx` — removed (or 1-line
  redirect to `/portal`).
- `src/routes/app.holders.index.tsx` — phone/email search, totals chip.
- `src/routes/app.holders.$id.tsx` — totals header, link-review panel,
  display-name promotion.
- `src/routes/app.transactions.index.tsx` — advanced filters over the
  holder ledger.
- `src/components/app/new-holder-dialog.tsx` — phone/email inputs.
- `src/lib/i18n/{en,ar}.ts` — new labels.
- `src/routes/login.tsx` — verify/respect `lock=1` portal lock.

## Out of scope (intentionally)

- Renaming tables to `dahab_accounts` / `transactions` — explicitly not
  doing this per your instruction.
- Removing legacy `accounts` / `transactions` / `account_balances`
  tables. They still back the staff transaction-entry / approvals flow
  (`post_transaction`, `approve_transaction`, vault accounting). They
  remain as-is; the customer-facing UI just no longer reads from them.
