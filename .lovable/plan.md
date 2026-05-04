## Goal

Produce a single SQL migration that recreates the entire Dahab backend from scratch — safe to run on an empty database — covering everything the app reads/writes.

## What the migration will create

**Enums**
`app_role`, `account_kind`, `account_nature`, `vault_channel`, `currency_code` (USD/EUR/LYD), `tx_direction`, `tx_status`, `entry_side`, `notification_event`, `notification_severity`.

**Sequences**
`tx_number_seq`, `customer_account_seq`, `dahab_holder_seq`.

**Tables (all with RLS enabled)**
- Identity: `profiles`, `user_roles`
- Ledger core: `accounts`, `account_balances`, `transactions`, `ledger_entries`, `transaction_attachments`, `audit_log`
- Holders / import: `account_holders`, `holder_accounts`, `holder_ledger_entries`, `account_name_aliases`, `account_import_batches`, `account_import_staging`, `account_link_review_queue`
- Lookup: `currencies` (seeded with USD/EUR/LYD)
- Notifications: `notifications`, `notification_preferences`, `notification_reminders_state`, `push_subscriptions`
- Passkeys: `webauthn_credentials`, `webauthn_challenges`

**Functions** (matching the exact signatures the app calls)
`has_role`, `is_staff`, `handle_new_user`, `set_account_number`,
`post_transaction`, `approve_transaction`, `reject_transaction`, `correct_transaction`,
`ensure_customer_account_for_holder_account`,
`notifications_mark_read`, `notifications_mark_all_read`, `_notify_user`, `_notify_role`, `run_notification_reminders`,
`approve_import_batch`, `import_linked_accounts_batch`, `resolve_review_row`, `next_dahab_account_number`,
`seed_demo_ledger`, `_upsert_vault`, `_upsert_customer`, `_seed_post_tx`, `_seed_pending_tx`,
`tg_accounts_notify`, `tg_transactions_notify`,
`lookup_user_email_for_credential`.

**Triggers**
- `auth.users` AFTER INSERT → `handle_new_user`
- `accounts` BEFORE INSERT → `set_account_number`
- `accounts` AFTER INSERT → `tg_accounts_notify`
- `transactions` AFTER INSERT/UPDATE → `tg_transactions_notify`

**RLS policies** (mirroring current production rules)
Staff-read / admin-write for ledger and holder tables; self-only for notifications, prefs, push subs, passkeys; consumer can read their own accounts/transactions via `owner_user_id`.

**Storage**
Private bucket `tx-attachments` plus storage.objects policies so staff can read/write and the uploader can read their own.

## How it will be delivered

One `supabase--migration` call containing the full SQL. After approval, the Supabase types file regenerates automatically and the existing app code (which already targets these exact names) will work unchanged.

## Notes

- Safe on a fresh DB. If tables already exist, the migration will fail rather than silently overwrite — that's intentional, since this is a rebuild script.
- No data is inserted except the 3 currency rows. To populate demo users/vaults/customers, hit `POST /api/public/admin/seed-demo` afterwards.
- After the migration runs, I'll run the Supabase linter and fix any flagged issues.