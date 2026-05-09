# DAHAB — Database Contract

Mapping of every app feature to the database surface it requires. This is
**database-shaped** (engine-agnostic SQL), not AWS-specific. The AWS SQL
implementation lives in `database/aws/`.

Conventions used below:
- **Money is stored as `bigint` minor units** (`amount_minor`, `balance_minor`). 100 = 1.00 in any currency. Never use float.
- **IDs**: bigint identity for legacy tables (`account_holders`, `holder_accounts`, `account_import_*`, `branches`, `fx_rates`, etc.); UUID for the modern double-entry side (`accounts`, `transactions`, `ledger_entries`, `notifications`, `audit_log`).
- **Currency** is the enum `currency_code = ('USD','EUR','LYD')`. `dahabApi.ts` declares `'GBP'` as a future option but the database does NOT include it today. Adding GBP requires an enum migration AND seeded `currencies` row AND staff training — leave as **Needs confirmation** until a business decision is made.
- **Permissions column** below is the rule the API/RLS must enforce.

---

## 1. Users & roles

### Table `user_roles` (writable by admin)
| Column | Type | Req | Validation | Notes |
|---|---|---|---|---|
| id | uuid PK | yes | default `gen_random_uuid()` | |
| user_id | uuid → auth user | yes | FK to auth.users (Supabase) / Cognito user id (AWS) | |
| role | enum `app_role` | yes | one of admin/teller/auditor/consumer | |
| created_at | timestamptz | yes | default now() | |

Unique on (`user_id`, `role`). RLS: read self or admin; write admin only.

Helper SQL: `has_role(uuid, app_role) → boolean` SECURITY DEFINER, `is_staff(uuid) → boolean`.

## 2. Authentication profile

### Table `profiles`
| Column | Type | Req | Notes |
|---|---|---|---|
| id | uuid PK | yes | matches auth user id |
| full_name | text | yes | default '' |
| branch_id | bigint FK `branches.id` | no | optional teller→branch link |
| must_change_password | boolean | yes | default false |
| created_at | timestamptz | yes | default now() |

RLS: self read, self update; staff read all.

## 3. Account holders

### Table `account_holders`
| Column | Type | Req | Validation |
|---|---|---|---|
| id | bigserial PK | yes | |
| dahab_account_number | varchar | yes | unique, format from `next_dahab_account_number()` |
| canonical_name | text | yes | min length 2 |
| normalized_name | text | yes | derived (lower/strip diacritics) |
| holder_type | varchar | yes | one of INDIVIDUAL, BUSINESS, TRUST |
| status | varchar | yes | default ACTIVE |
| owner_user_id | uuid | no | only for consumer-portal-linked holders |
| phone, email | text | no | basic format checks |
| created_at, updated_at | timestamptz | yes | |

RLS: staff read all; owner reads own; admin write.

## 4. Multi-currency holder accounts

### Table `holder_accounts`
| Column | Type | Req | Notes |
|---|---|---|---|
| id | bigserial PK | yes | |
| account_holder_id | bigint → account_holders | yes | |
| account_number | varchar | yes | unique per holder; from `next_holder_account_number(p_dahab,p_currency)` |
| account_display_name | text | yes | min 2 chars |
| account_alias_name | text | no | |
| currency_code | varchar | yes | enum currency_code |
| account_nature | varchar | yes | Debit or Credit |
| status | varchar | yes | default ACTIVE |
| current_balance | numeric(20,2) | yes | default 0 — computed by ledger triggers |
| credit_limit | numeric(20,2) | yes | default 0 |
| debit_limit | numeric(20,2) | yes | default 0 |
| withdraw_limit_amount | numeric(20,2) | yes | default 0 |
| withdraw_limit_enabled | boolean | yes | default false |
| dahab_account_number | varchar | no | denormalized for fast search |
| is_primary_account | boolean | yes | default false |
| created_at, updated_at | timestamptz | yes | |

RLS: staff read all; owner reads via `account_holders.owner_user_id = auth.uid()`; admin write.

## 5. Account aliases

### Table `account_name_aliases`
| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| account_id | bigint → holder_accounts | |
| alias_name | text | |
| alias_type | varchar | default ALTERNATIVE |
| created_at | timestamptz | |

Used by the wizard's customer search.

## 6. Ledger entries

### Table `holder_ledger_entries` (legacy single-sided ledger for portal/statements)
| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| account_id | bigint → holder_accounts | |
| tx_number | varchar | denormalized from `transactions.tx_number` |
| posted_at | timestamptz | |
| description | text | |
| debit_amount | numeric(20,2) | |
| credit_amount | numeric(20,2) | |
| balance_after | numeric(20,2) | **must be preserved**, computed at insert time |
| currency_code | varchar | |
| created_at | timestamptz | |

### Table `ledger_entries` (modern double-entry; one row per side)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| transaction_id | uuid → transactions | |
| account_id | uuid → accounts | |
| amount_minor | bigint | always positive |
| side | enum entry_side ('debit','credit') | |
| currency | enum currency_code | |
| created_at | timestamptz | |

Constraint: every `transactions` row must have **exactly two** ledger_entries with equal `amount_minor` and matching `currency`, one debit + one credit.

## 7. Transactions

### Table `transactions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tx_number | text unique | generated by RPC |
| customer_account_id | uuid → accounts | required |
| vault_account_id | uuid → accounts | required for cash/bank channels |
| direction | enum tx_direction | deposit / withdraw |
| channel | enum vault_channel | cash / bank |
| currency | enum currency_code | |
| amount_minor | bigint | post-approval amount |
| requested_amount_minor | bigint | original request before partial approval |
| status | enum tx_status | posted / pending / rejected / reversed |
| comment | text | min 3, max 280 |
| review_reason | text | populated when forced into pending |
| reject_reason | text | |
| correction_reason | text | |
| reverses_tx_id | uuid → transactions | |
| corrected_by_tx_id | uuid → transactions | |
| created_by_user_id | uuid | required |
| approved_by_user_id | uuid | |
| created_at | timestamptz | |
| posted_at | timestamptz | |
| partial_approved | boolean | default false |
| branch_id | bigint → branches | filled by trigger from creator's profile |

RLS: staff read all; consumer reads own via the `accounts.owner_user_id` chain. **Direct INSERT/UPDATE/DELETE forbidden** — all writes via RPCs.

## 8. Deposits & 9. Withdrawals

Same `transactions` row, distinguished by `direction`. Posted via RPC
`post_transaction(...)`. The RPC creates the two `ledger_entries` and updates
`account_balances`.

## 10. Approvals

When `post_transaction` decides the txn must be reviewed (large amount,
withdraw exceeding limit, etc.) it inserts with `status='pending'` and
populates `review_reason`. Admin then calls `approve_transaction(p_tx_id, [p_approved_amount_minor])` or `reject_transaction(p_tx_id, p_reason)`.

Approved partials set `partial_approved = true` and `requested_amount_minor`
keeps the original ask.

## 11. Corrections / reversals

`correct_transaction(p_tx_id, p_new_amount_minor, p_new_comment, p_correction_reason)`:
1. Inserts a reversal txn (`status='reversed'`, `reverses_tx_id = p_tx_id`).
2. Inserts a fresh corrected txn linked back via `corrected_by_tx_id`.
3. Writes both balance/ledger sides.
4. Writes `audit_log` entries `tx.reverse` and `tx.correct`.

Direct edits are forbidden.

## 12 + 13. Vault accounts & balances

### Table `accounts` (modern customer + vault accounts)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| account_number | text | optional |
| kind | enum account_kind ('customer','vault') | |
| nature | enum account_nature ('credit','debit') | |
| vault_channel | enum vault_channel | nullable for customer accounts; required when kind='vault' |
| owner_user_id | uuid | required for customer accounts owned by a portal user |
| status | text | default 'active' |
| phone, national_id | text | |
| created_at | timestamptz | |

### Table `account_balances`
| Column | Type | Notes |
|---|---|---|
| account_id | uuid → accounts | PK part |
| currency | enum currency_code | PK part |
| balance_minor | bigint | required, default 0 |
| debit_limit_minor | bigint | default 0 |

PK (account_id, currency). RLS: staff read all; owner reads own.

## 14 + 15. Account groups & members

`account_groups` and `account_group_members` (composite of `group_id`,
`holder_account_id`). Used to bundle holder accounts for reporting; admin
write only.

## 16-18. Excel import pipeline

- `account_import_batches` — file_name, status, counts.
- `account_import_staging` — one row per Excel row, with `review_status`.
- `account_link_review_queue` — ambiguous rows promoted for human review.

RPCs:
- `import_linked_accounts_batch(p_batch_id)` — process a staging batch.
- `approve_import_batch(p_batch_id)` — finalize.
- `resolve_review_row(p_row_id, p_decision jsonb)` — admin chooses the link.

## 19. Reports

Backed by SQL **views** plus a few jsonb-returning RPCs (see
`REPORTS_METRIC_MAPPING.md`). Required:

- `report_consolidated_usd()` (jsonb) — already exists; sums each currency × latest `fx_rates.usd_rate`. Returns `{total_usd_minor, breakdown, missing_rates, computed_at}`.
- `report_volume_by_currency_30d` (view)
- `report_daily_volume_7d` (view)
- `report_currency_distribution` (view)
- `report_customer_growth_7m` (view)
- `report_top_accounts_by_balance` (view)
- `report_cash_flow_daily` (view) — needed for the cash-flow chart.
- `report_approval_speed` (view) — created→approved median.
- `report_hourly_traffic` (view) — txn count by hour-of-day.
- `report_processing_time_dist` (view) — buckets of (posted_at-created_at).
- `report_rejection_rate_trend` (view) — daily rejection %.
- `report_liquidity_health` (view) — needs `vault_targets` table.
- `teller_daily_stats` (table maintained by trigger) — for tellers leaderboard.
- `compliance_alerts` (+ types/typology) — for compliance lens. **Needs confirmation** of business rules.

## 20. Dashboard metrics

No new objects — already covered by tables in §3, §4, §7, §12. RPC-friendly:
- `dashboard_currency_totals(p_kind, p_vault_channel)` (proposed) returning `[{currency, balance_minor}]` to keep currency math server-side.

## 21. Notifications

- `notifications` (id uuid, user_id, event_type enum `notification_event`, severity enum, title, body, data jsonb, transaction_id, created_at, read_at).
- `notification_preferences` per user (jsonb-heavy, schema in tables list).
- `notification_reminders_state` (user_id, kind, last_sent_at).
- `push_subscriptions` (web push subscriptions).

RPCs: `notifications_mark_read(uuid[])`, `notifications_mark_all_read()`,
`run_notification_reminders()`.

## 22. Audit log

`audit_log` (uuid PK, actor_user_id, action text, target text, details jsonb,
created_at). **Append-only**: no UPDATE/DELETE policy. All RPCs that mutate
financial data must write here.

Known actions: `tx.create`, `tx.post`, `tx.reverse`, `tx.correct`, `tx.reject`,
`holder.create`, `holder_account.create`, `withdraw_limit.update`,
`role.grant`, `role.revoke`, `user.email_change`, `user.password_reset`,
`fx_rate.create`, `branch.create`, `branch.update`.

## 23. Customer portal

Reads only (RLS-scoped):
- `account_holders` where `owner_user_id = auth.uid()`.
- `holder_accounts` (via FK chain) and `holder_ledger_entries` (via FK chain).
- `accounts` where `owner_user_id = auth.uid()` + `account_balances`.
- `transactions` where `customer_account_id` is one of the user's accounts.
- RPC `get_holder_currency_totals(p_holder_id)`.

## 24. Attachments

`transaction_attachments` (uuid PK, transaction_id, storage_path, file_name,
content_type, size_bytes, uploaded_by, created_at). Storage backend on AWS:
S3 bucket `dahab-tx-attachments` (private). Frontend currently does **not**
upload — feature reserved (Needs confirmation).

---

## Permissions matrix (summary)

| Object | admin | teller | auditor | consumer |
|---|---|---|---|---|
| account_holders | RW | R | R | R own |
| holder_accounts | RW | R | R | R own |
| accounts, account_balances | RW | R | R | R own |
| transactions | R + RPC | R + RPC create | R | R own |
| approvals (RPC) | yes | no | no | no |
| corrections (RPC) | yes | no | no | no |
| account_groups / members | RW | – | R | – |
| audit_log | R | – | R | – |
| fx_rates | RW | R | R | – |
| branches | RW | R | R | – |
| user_roles, profiles | RW | R self | R | R self |
| notifications | R own + RPC | R own + RPC | R own + RPC | R own + RPC |
| import_* | RW | – | R | – |
| reports views | R | R subset | R | – |

R = SELECT, RW = SELECT+INSERT+UPDATE. DELETE is forbidden almost everywhere
(see DATA_INTEGRITY_RULES.md).

All permissions must be enforced **server-side** (RLS in PostgreSQL OR API
middleware on AWS) — never trust the client.
