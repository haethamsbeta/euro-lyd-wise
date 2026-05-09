# DAHAB — App Structure & Backend Requirements

> Audit performed against the current Lovable codebase (frontend only — no
> backend logic was modified). Goal: describe the app to a backend / database
> developer who has never seen the UI, so they can build an AWS-compatible
> data + API layer that matches what the frontend already expects.

The app is a multi-currency vault & customer-account management system for a
gold / foreign-exchange business ("Dahab Libya"). It has three internal staff
roles (admin, teller, auditor) plus an external `consumer` role that uses the
customer portal.

---

## 1. Routes / Pages

File-based routing in `src/routes/` (TanStack Start).

### Public / auth
| Route | File | Purpose |
|---|---|---|
| `/` | `index.tsx` | Marketing landing |
| `/login` | `login.tsx` | Email+password / passkey login. `?portal=consumer` switches branding. |
| `/forgot-password` | `forgot-password.tsx` | Request password reset email |
| `/reset-password` | `reset-password.tsx` | Set new password from email link |
| `/change-password` | `change-password.tsx` | Forced change after admin reset (`profiles.must_change_password=true`) |

### Internal staff app (gated in `app.tsx`)
| Route | File | Allowed roles |
|---|---|---|
| `/app` | `app.index.tsx` | admin, teller, auditor (different sub-views) |
| `/app/transactions/new` | `app.transactions.new.index.tsx` + `new-transaction-wizard.tsx` | admin, teller |
| `/app/transactions/new/deposit` | `app.transactions.new.deposit.tsx` | admin, teller |
| `/app/transactions/new/withdraw` | `app.transactions.new.withdraw.tsx` | admin, teller |
| `/app/transactions` | `app.transactions.index.tsx` | admin, teller, auditor |
| `/app/holders` | `app.holders.index.tsx` | admin, teller, auditor |
| `/app/holders/new` | `app.holders.new.tsx` | admin |
| `/app/holders/$id` | `app.holders.$id.tsx` | admin, teller, auditor |
| `/app/accounts/$id` | `app.accounts.$id.tsx` | admin, teller, auditor |
| `/app/vaults` | `app.vaults.index.tsx` | admin, teller, auditor |
| `/app/vaults/$id` | `app.vaults.$id.tsx` | admin, teller, auditor |
| `/app/groups` | `app.groups.index.tsx` | admin, auditor |
| `/app/groups/$id` | `app.groups.$id.tsx` | admin, auditor |
| `/app/approvals` | `app.approvals.tsx` | admin |
| `/app/me/activity` | `app.me.activity.tsx` | admin, teller |
| `/app/audit` | `app.audit.tsx` | admin, auditor |
| `/app/reports` | `app.reports.tsx` | admin, auditor |
| `/app/users` | `app.users.tsx` | admin |
| `/app/users/new-consumer` | `app.users.new-consumer.tsx` | admin |
| `/app/portal-accounts` | `app.portal-accounts.tsx` | admin |
| `/app/admin/fx-rates` | `app.admin.fx-rates.tsx` | admin |
| `/app/admin/branches` | `app.admin.branches.tsx` | admin |
| `/app/settings/notifications` | `app.settings.notifications.tsx` | all staff |
| `/app/settings/security` | `app.settings.security.tsx` | all staff (passkeys) |
| `/app/about` | `app.about.tsx` | all staff |

### Customer portal (gated to non-staff `consumer`)
| Route | File | Purpose |
|---|---|---|
| `/portal` | `portal.tsx` | Holder card, currency totals, account list |
| `/portal/$accountId/$currency` | `portal.$accountId.$currency.tsx` | Statement / ledger for one account+currency |

### Mobile shells
| Route | File |
|---|---|
| `/m`, `/m/login`, `/m/dashboard` | `m.*.tsx` |

### Server / API routes
| Route | File | Purpose |
|---|---|---|
| `POST /api/public/admin/seed-demo` | `api/public/admin/seed-demo.ts` | Dev-only seed |
| `POST /api/public/hooks/notifications-tick` | `api/public/hooks/notifications-tick.ts` | Cron tick → reminder fan-out |

Server functions in `src/server/*.functions.ts` (called via `useServerFn`):
- `admin.functions.ts` — `adminListUserEmails`, `adminChangeUserEmail`
- `auth.functions.ts` — admin reset
- `webauthn.functions.ts` — passkey ceremonies

---

## 2. Roles & Login Flows

Roles in **`user_roles`** (one row per (user, role)): `admin | teller | auditor | consumer`.
SQL helpers required by RLS:
- `has_role(_user_id uuid, _role app_role) → boolean` (security definer)
- `is_staff(_user_id uuid) → boolean` (admin OR teller OR auditor)

Frontend (`src/lib/auth.tsx`) loads roles once after sign-in and exposes
`hasAnyRole()`. Guarded routes use `<RoleGate allow={[...]}/>`.

Flows:
1. **Password** — `supabase.auth.signInWithPassword`
2. **Passkey / WebAuthn** — challenge issued + verified by
   `src/server/webauthn.functions.ts`, persisted in `webauthn_credentials` /
   `webauthn_challenges`.
3. **Forced password change** — when `profiles.must_change_password=true`
   user is redirected to `/change-password`; cleared by RPC
   `clear_must_change_password()`.
4. **Admin reset** — `/app/users` calls server fn `admin_reset_password`
   (admin client) → temporary password + flag set.
5. **Routing after login** — staff → `/app`, consumer → `/portal`.

---

## 3. Forms (fields submitted)

| Form | File | Fields | Backend write |
|---|---|---|---|
| New Holder step 1 | `app.holders.new.tsx` | `canonical_name`, `holder_type` ∈ {INDIVIDUAL,BUSINESS,TRUST}, optional `phone`, `email` | RPC `create_holder_with_accounts` |
| New Holder step 2 | same | array of `{currency_code, account_nature, account_display_name}` | passed as JSON to same RPC |
| Add account | `add-linked-account-dialog.tsx` | `{currency_code, account_nature, account_display_name, account_alias_name?, is_primary_account?}` | RPC `add_account_to_holder(p_holder_id, p_account)` |
| New Transaction | `new-transaction-wizard.tsx` | `customer_account_id` (uuid), `direction`, `channel` ∈ {cash,bank}, `currency`, `amount_minor` (int), `comment` (3..280) | RPC `post_transaction(...)` |
| Approve transaction | `app.approvals.tsx` | `tx_id`, optional `p_approved_amount_minor` | RPC `approve_transaction` |
| Reject transaction | `app.approvals.tsx` | `tx_id`, `reason` | RPC `reject_transaction` |
| Correct transaction | `app.transactions.index.tsx` | `tx_id`, `new_amount_minor`, `new_comment`, `correction_reason` | RPC `correct_transaction` |
| Set holder withdraw limit | `app.accounts.$id.tsx` | `holder_account_id`, `enabled`, `amount`, `note?` | RPC `sp_set_holder_withdraw_limit` (audited via `holder_account_limit_events`) |
| New consumer user | `app.users.new-consumer.tsx` | `email`, `full_name`, optional initial holder link | server fn (admin client) |
| Change user email | `app.users.tsx` | `target_user_id`, `new_email` | RPC `admin_change_user_email` |
| Grant / revoke role | `app.users.tsx` | `user_id`, `role` | direct insert/delete on `user_roles` |
| FX rate | `app.admin.fx-rates.tsx` | `currency`, `usd_rate`, `as_of_date`, `note?` | direct insert into `fx_rates` |
| Branch | `app.admin.branches.tsx` | `code`, `name`, `city?`, `status` | upsert `branches` |
| Account group | `app.groups.index.tsx` | `name`, `description?`, `group_type`, `is_pinned` | upsert `account_groups` |
| Group member | `app.groups.$id.tsx` | `group_id`, `holder_account_id` | insert `account_group_members` |
| Notification prefs | `app.settings.notifications.tsx` | `enabled` (jsonb), `large_tx_threshold` (jsonb), `low_vault_threshold` (jsonb), `quiet_hours_start/end`, `daily_summary_*`, `pending_reminder_minutes`, `browser_push_enabled` | upsert `notification_preferences` |
| Passkey register | `app.settings.security.tsx` | WebAuthn attestation | server fn → `webauthn_credentials` |
| Login / forgot / reset | `login.tsx`, `forgot-password.tsx`, `reset-password.tsx` | `email` / `password` / passkey | Supabase auth |

---

## 4. Tables (visible columns)

| Page | Visible columns |
|---|---|
| `/app/transactions` | tx_number, posted_at/created_at, holder, direction, channel, currency, amount (formatted from `amount_minor`), status, comment, branch |
| `/app/holders` | dahab_account_number, canonical_name, holder_type, status, phone, # linked accounts, total balance per currency |
| `/app/holders/$id` | account_number, currency_code, display_name, alias, current_balance, status, withdraw_limit |
| `/app/accounts/$id` | tx_number, posted_at, description, debit_amount, credit_amount, balance_after |
| `/app/vaults` | vault name, channel, status, balance per currency |
| `/app/approvals` | tx_number, holder, direction, channel, currency, requested vs amount_minor, review_reason, comment, created_at |
| `/app/audit` | created_at, actor, action, target, formatted details |
| `/app/me/activity` | recent transactions created by self |
| `/app/groups` | group name, type, member count, totals per currency |
| `/app/users` | email, full_name, roles[] |
| `/app/portal-accounts` | consumer email, linked holders |
| `/app/admin/fx-rates` | currency, usd_rate, as_of_date, note, created_by, created_at |
| `/app/admin/branches` | code, name, city, status, created_at |

---

## 5. Dashboard cards & metrics (`/app`)

Implemented in `app.index.tsx` via `useDashData()`.

- **Cash totals per currency** — `Σ account_balances.balance_minor` where `accounts.kind='vault' AND vault_channel='cash'`, grouped by `currency`.
- **Bank totals per currency** — same, `vault_channel='bank'`.
- **Customer totals per currency** — same, `accounts.kind='customer'`.
- **Recent transactions (8)** — `transactions ORDER BY created_at DESC LIMIT 8`.
- **Pending approvals count** — `count(transactions WHERE status='pending')`.
- **Holder count** — `count(account_holders)`.
- **Pinned customer accounts** — frontend `localStorage` IDs hydrated against `accounts` + `account_balances`.
- **Teller dashboard** — own posted vs pending counts, last shift, reminders (filtered to `created_by_user_id = me`).
- **Auditor dashboard** — pending approvals, posted today, audit highlights.

---

## 6. Reports page (`/app/reports`)

`useReportsData()` powers Business KPIs from `transactions / account_holders /
account_balances` (last 30 days + last 7 days).

**Live (real DB):**
- Total / Posted / Rejected (30d), Rejection rate %.
- Active holders count.
- Volume by currency (LYD/USD/EUR) — sum of posted `amount_minor` per currency.
- Daily volume sparkline (7d).
- Currency distribution pie — share of `account_balances` per currency.
- Customer growth bar (7 months).
- Avg LYD txn value.
- Top 5 accounts by balance.

**Demo / placeholder ("illustrative until wired"):**
| Metric | Source today | Future source |
|---|---|---|
| Hourly traffic | hard-coded | view `report_hourly_traffic` |
| Cash flow (deposits vs withdrawals daily) | hard-coded | aggregate `transactions` by day + direction |
| Approval trend | hard-coded | created→approved interval view |
| Transaction mix | hard-coded | `transactions` direction counts |
| Liquidity health (days of cover) | hard-coded | requires `vault_targets` + view `report_liquidity_health` |
| Tellers leaderboard | hard-coded | requires `teller_daily_stats` table maintained by trigger |
| Processing time distribution | hard-coded | `created_at → posted_at` view |
| Rejection rate trend | hard-coded | view |
| Risk metrics, typology, alert volume | hard-coded | new `compliance_*` schema |

Filters: lens (Business / Tellers / Compliance), date range (7/30/90d), currency.
Charts always group by currency; **no FX conversion** unless explicit `fx_rates` exist.

---

## 7. Customer portal

Reads:
- `account_holders` row owned by user (`owner_user_id = auth.uid()`) with nested `holder_accounts`.
- RPC `get_holder_currency_totals(p_holder_id)` → `[{currency_code, total}]`.
- Per-account: `accounts` + `account_balances`, plus `transactions` filtered to `customer_account_id = $id AND currency = $ccy` (DESC, limit 500).
- PDF / CSV statement export.

RLS guarantees the consumer only sees rows owned via the `account_holders.owner_user_id` chain.

---

## 8. Admin / Staff data needs

- **Approvals** — `transactions WHERE status='pending'` with full detail.
- **Audit** — `audit_log` + `profiles` for actor name.
- **Users** — `profiles` + `user_roles` + auth emails (server fn).
- **Portal accounts** — consumers + their `account_holders`.
- **FX rates** — full history of `fx_rates`.
- **Branches** — full list of `branches`.
- **Groups** — `account_groups` + member counts + RPC `get_group_totals`.
- **Holders / Accounts** — `account_holders` + `holder_accounts` + `account_name_aliases` + `holder_account_limit_events`.
- **Account ledger** — `holder_ledger_entries`.

---

## 9. Mock / static data still used

- Arrays at top of `src/routes/app.reports.tsx`
  (`hourlyTraffic`, `approvalTrend`, `cashFlow`, `txnMix`, `liquidityHealth`,
  `tellers`, `processingTimeDist`, `errorRateTrend`, `riskMetrics`,
  `riskTypology`, `alertVolume`).
- Per-user dashboard preferences in `localStorage` key `dahab.dash.prefs:<user_id>`.
- `src/lib/dahabApi.ts` — AWS HTTP client scaffold, **not used** by any page yet.

---

## 10. Existing data types / interfaces

- **DB types**: `src/integrations/supabase/types.ts` (auto-generated; every table, view, RPC, enum).
- **HTTP scaffold**: `src/lib/dahabApi.ts` — `Holder`, `HolderAccount`, `LedgerEntry`, `Transaction`, `InternalAccount`, `Currency`, `AccountNature`, `HolderStatus`, `TransactionCategory`, `InternalAccountKind`, `ApiEnvelope<T>`.
- **Roles**: `src/lib/auth.tsx` (`AppRole`).
- **Wizard local types**: `HolderCardHit`, `Direction`, `Channel`, `Currency` in `new-transaction-wizard.tsx`.
- **i18n keys**: `src/lib/i18n/{en,ar}.ts`.

---

## 11. Backend client surfaces in use

1. **Supabase JS client** (`@/integrations/supabase/client`) — dominant path. Direct `from(table)` reads under RLS + all RPC calls.
2. **TanStack Start server functions** (`src/server/*.functions.ts`) — admin operations needing the service role (admin emails, password reset, WebAuthn ceremonies).
3. **Public TanStack route handlers** (`src/routes/api/public/*`) — notification cron tick + demo seeder only.

**RPCs invoked by frontend (authoritative):**
```
post_transaction
approve_transaction
reject_transaction
correct_transaction
create_holder_with_accounts
add_account_to_holder
sp_set_holder_withdraw_limit
get_holder_currency_totals
report_consolidated_usd
notifications_mark_read
notifications_mark_all_read
clear_must_change_password
admin_reset_password
admin_change_user_email
```

**Tables read directly by frontend:**
```
account_holders, holder_accounts, accounts, account_balances,
transactions, audit_log, profiles, user_roles,
account_groups, account_group_members, branches, fx_rates,
notification_preferences, push_subscriptions
```

The `dahabApi.ts` HTTP scaffold is **not** wired in. There are **no `fetch()`
calls to a REST API** anywhere in `src/`.

---

## 12. Where the frontend expects backend data

Every page in §1 except `/app/about` and the auth forms expects backend data.

- Dashboards & reports — read-only aggregates.
- Holders / Accounts / Vaults / Groups / Audit / Approvals — read-mostly, admin writes.
- Transactions — write through RPCs only (RLS blocks direct INSERT/UPDATE/DELETE on `transactions`).
- Customer portal — read-only, scoped to authenticated user.

The contract any future AWS backend MUST satisfy is enumerated in
`docs/DATABASE_CONTRACT.md`, `docs/API_CONTRACT.md`, and
`docs/API_RESPONSE_SHAPES.md`.
