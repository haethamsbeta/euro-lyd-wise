# DAHAB — SQL Server / Lambda Connection Readiness Audit

> Audit only. **No UI, route, behavior, schema, or business logic was changed.**
> Findings are evidence-based: file paths and line numbers point to current code.

---

## 0. Stack reconciliation — BLOCKING / Needs confirmation

The committed backend package under `database/aws/` and most `docs/*.md` files
target **PostgreSQL 15+ on AWS RDS** (enums, `jsonb`, `BIGSERIAL`,
`gen_random_uuid`, RLS, PL/pgSQL, `current_setting('app.current_user_id')`).

This request states the backend is **SQL Server (DAHABDB) behind AWS Lambda /
API Gateway**, and lists object names that match the SQL Server build
(`sp_*`, `app_users`, `holder_account_limit_events`,
`official_cash_vault_balances`, `v_holder_account_withdraw_limits`,
`dahab_number_sequences`, etc.) — these do **not** exist in the PostgreSQL
package.

**Implication:** the SQL in `database/aws/*.sql` is **not** the schema the
Lambda layer will run against. Treat DAHABDB as the source of truth; treat
`database/aws/*.sql` as a parallel Postgres reference only. The frontend
contract (envelope, `*_minor` integers, role names, endpoint shapes) is
identical for both — the *frontend audit* below stands regardless of engine.

**Action required (out of scope for this turn):**
1. If SQL Server is canonical, archive `database/aws/*.sql` under
   `database/postgres-reference/` and add a SQL Server bundle mirroring the
   listed objects.
2. Update `docs/AWS_IMPLEMENTATION_HANDOFF.md`, `docs/DATABASE_CONTRACT.md`,
   and `docs/BACKEND_SOURCE_OF_TRUTH.md` engine references.

Marked **Needs confirmation** until you confirm the canonical engine.

---

## 1. Per-route readiness table

Status legend:
- `ready` — page already calls a backend; just swap data source to `apiFetch`.
- `needs update` — page works but contains hardcoded/mock UI values OR still
  uses `supabase.*` directly and must be migrated to `src/lib/api/*`.
- `missing` — required endpoint not yet documented or wired.

Data source key:
- `supabase.*` = direct browser → Supabase JS calls (must be replaced).
- `serverFn` = TanStack `createServerFn` (admin/webauthn helpers).
- `static` = literal values in source.

| # | Route | File | Roles | Data source today | Required Lambda endpoint(s) | Hardcoded / mock present | Status |
|---|---|---|---|---|---|---|---|
| 1 | `/login` | `src/routes/login.tsx` | public | `supabase.auth.signInWithPassword` | `POST /api/auth/login`, `GET /api/auth/me` | demo creds shown only as placeholder text (H11) | needs update |
| 2 | `/forgot-password` | `src/routes/forgot-password.tsx` | public | form only | `POST /api/auth/forgot-password` | none | ready |
| 3 | `/reset-password` | `src/routes/reset-password.tsx` | public (token) | `supabase.auth.updateUser` | `POST /api/auth/reset-password` | none | needs update |
| 4 | `/change-password` | `src/routes/change-password.tsx` | any auth | form only | `POST /api/auth/change-password`, `POST /api/auth/clear-must-change` | none | ready |
| 5 | `/app` (admin dashboard) | `src/routes/app.index.tsx` | admin, teller, auditor | `supabase.from(...)` | `GET /api/dashboard/staff` | **H1: hardcoded FX in Network Pulse, lines 205–210 (USD×4.85, EUR×5.3)** | needs update |
| 6 | `/app/holders` | `src/routes/app.holders.index.tsx` | admin, teller, auditor | `supabase.from('account_holders')` | `GET /api/holders?q&limit&offset` | none | needs update |
| 7 | `/app/holders/new` | `src/routes/app.holders.new.tsx` | admin | `supabase.rpc('create_holder_with_accounts')` | `POST /api/holders` | none | needs update |
| 8 | `/app/holders/$id` | `src/routes/app.holders.$id.tsx` | admin, teller, auditor | `supabase.from + rpc('get_holder_currency_totals')` | `GET /api/holders/:id`, `…/accounts`, `…/totals` | none | needs update |
| 9 | `/app/accounts/$id` | `src/routes/app.accounts.$id.tsx` | admin, teller, auditor or owner | `supabase.from('holder_ledger_entries')` | `GET /api/holder-accounts/:id`, `…/ledger`, `POST …/withdraw-limit` | none | needs update |
| 10 | `/app/transactions` | `src/routes/app.transactions.index.tsx` | admin, teller, auditor | `supabase.from('transactions')` | `GET /api/transactions` (q,from,to,status,direction,channel,currency,limit,offset) | none | needs update |
| 11 | `/app/transactions/$id` | `src/routes/app.transactions.$id.tsx` | admin, teller, auditor or owner | `supabase.from + rpc` | `GET /api/transactions/:id`, `POST …/correct` | none | needs update |
| 12 | `/app/transactions/new/deposit` | `…new.deposit.tsx` + `new-transaction-wizard.tsx` | admin, teller | `supabase.rpc('post_transaction')` | `POST /api/transactions` | none — limits & approval threshold come from server | needs update |
| 13 | `/app/transactions/new/withdraw` | `…new.withdraw.tsx` | admin, teller | `supabase.rpc('post_transaction' + 'sp_validate_holder_withdrawal')` | `POST /api/transactions`, `GET /api/holder-accounts/:id/withdraw-limit` | none | needs update |
| 14 | `/app/approvals` | `src/routes/app.approvals.tsx` | admin | `supabase.from + rpc` | `GET /api/approvals/pending`, `POST …/approve`, `…/reject` | none | needs update |
| 15 | `/app/vaults` (index) | `src/routes/app.vaults.index.tsx` | admin, teller, auditor | `supabase.from('accounts')` filtered `kind='vault'` | `GET /api/vaults`, `…/recent-activity`, `…/consolidated-usd` | server must enforce 10-official-vault filter | needs update |
| 16 | `/app/vaults/$id` | `src/routes/app.vaults.$id.tsx` | admin, teller, auditor | `supabase.from` | `GET /api/vaults/:id` (uses `official_cash_vault_balances` + `transactions WHERE transaction_category='cash'`) | none | needs update |
| 17 | `/app/reports` | `src/routes/app.reports.tsx` | admin, auditor | partial `supabase` + **lots of static** | `GET /api/reports/business/overview`, `…/cash-flow`, `…/approval-speed`, `…/hourly-traffic`, `…/processing-time-dist`, `…/rejection-rate`, `…/liquidity-health`, `…/tellers/today`, `…/compliance/overview` | **H3–H10** (see §2) | missing |
| 18 | `/app/audit` | `src/routes/app.audit.tsx` | admin, auditor | `supabase.from('audit_log')` | `GET /api/audit?from&to&action&actor&limit&offset` | none | needs update |
| 19 | `/app/settings/notifications` | `src/routes/app.settings.notifications.tsx` | any | `supabase.from('notification_preferences')` + push helpers | `GET/PUT /api/notification-preferences`, `POST /api/push-subscriptions`, `GET /api/push/vapid-public-key` | none — VAPID public key fetched from server | needs update |
| 20 | `/app/settings/security` | `src/routes/app.settings.security.tsx` | any | `serverFn` `listMyPasskeys`/`deleteMyPasskey` | `GET/POST/DELETE /api/auth/passkey/*` | none | ready |
| 21 | `/app/users` | `src/routes/app.users.tsx` | admin | `supabase.from + rpc` | `GET /api/users`, `POST /api/users/consumer`, `PATCH …/email`, `POST …/reset-password`, `POST/DELETE …/roles/:role` | none | needs update |
| 22 | `/app/users/new-consumer` | `src/routes/app.users.new-consumer.tsx` | admin | `supabase.rpc` | `POST /api/users/consumer` | none | needs update |
| 23 | `/app/groups` | `src/routes/app.groups.index.tsx` | admin, auditor | `supabase.from` | `GET/POST /api/groups` | none | needs update |
| 24 | `/app/groups/$id` | `src/routes/app.groups.$id.tsx` | admin, auditor | `supabase.from` | `GET /api/groups/:id`, `POST/DELETE /api/groups/:id/members` | none | needs update |
| 25 | `/app/portal-accounts` | `src/routes/app.portal-accounts.tsx` | admin | `supabase.from` | `GET /api/users` filtered by role=consumer | none | needs update |
| 26 | `/app/admin/fx-rates` | `src/routes/app.admin.fx-rates.tsx` | admin | `supabase.from('fx_rates')` | `GET/POST /api/admin/fx-rates` | none | needs update |
| 27 | `/app/admin/branches` | `src/routes/app.admin.branches.tsx` | admin | `supabase.from('branches')` | `GET/POST /api/admin/branches` | none | needs update |
| 28 | `/app/me/activity` | `src/routes/app.me.activity.tsx` | admin, teller | `supabase.from('transactions')` self | `GET /api/transactions/me/recent?limit=` | none | needs update |
| 29 | `/app/about` | `src/routes/app.about.tsx` | any | static text | n/a | informational only | ready |
| 30 | `/portal` | `src/routes/portal.tsx` | consumer | `supabase.from` (RLS scoped) | `GET /api/portal/me`, `…/totals` | none — Lambda **must** enforce `owner_user_id == JWT.sub` | needs update |
| 31 | `/portal/$accountId/$currency` | `src/routes/portal.$accountId.$currency.tsx` | consumer | `supabase.from` | `GET /api/portal/accounts/:id/ledger`, `GET /api/portal/statement.pdf` | none | needs update |
| 32 | `/m` (mobile shell) | `src/routes/m.tsx` | any | layout | n/a | none | ready |
| 33 | `/m/login` | `src/routes/m.login.tsx` | public | `supabase.auth.signInWithPassword` | `POST /api/auth/login` | none | needs update |
| 34 | `/m/dashboard` | `src/routes/m.dashboard.tsx` | admin, teller, auditor | `supabase.from` | `GET /api/dashboard/staff` (or `…/teller`) | none | needs update |
| 35 | `/m` index | `src/routes/m.index.tsx` | any | redirect | n/a | none | ready |
| 36 | `/api/public/admin/seed-demo` | `src/routes/api/public/admin/seed-demo.ts` | server route | `supabaseAdmin` | **delete before SQL Server cutover** (Postgres-only) | dev seeding only | missing-action |
| 37 | `/api/public/hooks/notifications-tick` | `src/routes/api/public/hooks/notifications-tick.ts` | server route | calls Postgres `run_notification_reminders()` | replace caller with HTTPS POST to Lambda `POST /api/internal/notifications/tick` (HMAC-signed) | currently invokes Postgres RPC | missing |

---

## 2. Hardcoded / mock data — definitive list

All locations below display business numbers in the UI that are not sourced
from a backend endpoint. Each must be deleted and replaced with a fetched
value before "API mode" is enabled.

| # | File | Lines | What it is | Required source |
|---|---|---|---|---|
| H1 | `src/routes/app.index.tsx` | 205–210 | "Network Pulse" totals: hardcoded FX `USD*4.85 + EUR*5.3` to fake an LYD-equivalent | Either remove the cross-currency tile, or compute server-side via `GET /api/reports/liquidity-health` using admin-entered FX. **Frontend must not multiply currencies.** |
| H2 | `src/routes/app.index.tsx` | 949+ | "Visual primitives (mockup parity)" — purely decorative, no numbers | none — keep |
| H3 | `src/routes/app.reports.tsx` | 45–52 | `hourlyTraffic` static array | `GET /api/reports/hourly-traffic?days=` |
| H4 | `src/routes/app.reports.tsx` | 54–72 | `cashFlow` static array | `GET /api/reports/cash-flow?days=` |
| H5 | `src/routes/app.reports.tsx` | 67–80 | `tellers` static leaderboard (T-001…T-006, branches, volumes) | `GET /api/reports/tellers/today` |
| H6 | `src/routes/app.reports.tsx` | 82–86 | `processingTimeDist` buckets | `GET /api/reports/processing-time-dist?days=` |
| H7 | `src/routes/app.reports.tsx` | 87–90 | `errorRateTrend` per-day rates | `GET /api/reports/rejection-rate?days=` |
| H8 | `src/routes/app.reports.tsx` | 91 | `riskMetrics` (flagged/pending/resolved/highRisk) | `GET /api/reports/compliance/overview` |
| H9 | `src/routes/app.reports.tsx` | 92+ | `riskTypology` slices | `GET /api/reports/compliance/overview` |
| H10 | `src/routes/app.reports.tsx` | 794–797 | KYC/Sanctions/Doc/AML target & value | `GET /api/reports/compliance/overview` (must include `target` per metric) |
| H11 | `src/routes/login.tsx` | placeholder text | demo creds shown in form placeholders | acceptable for *dev only*; gate behind `import.meta.env.DEV` before prod build |

No other route file in `src/routes/` ships with hardcoded balances, KPIs,
counts, badges, FX rates, thresholds, or fake transactions. The dashboard
visual primitives in `app.index.tsx` (sparkline shapes, gradient overlays)
contain only style data.

`localStorage`-only auth: **none found**. `src/lib/session-timeout.tsx` and
`src/lib/auth.tsx` use Supabase session tokens — these will be replaced by
the Lambda JWT provider per `docs/BACKEND_ADAPTER_PLAN.md`.

---

## 3. Cross-cutting readiness checks

| Check | Result | Evidence |
|---|---|---|
| Frontend has zero RDS / DB credentials / connection strings | PASS | grep of `src/` returns 0 hits for hostnames, `pg`, `mssql`, `tedious` |
| Money rendered with `formatMinor` (integer minor units) | PASS | `src/lib/format.ts`; no float arithmetic on money outside H1 |
| Frontend never multiplies currencies | FAIL (H1 only) | violated only by `app.index.tsx` Network Pulse |
| FX rates admin-entered only (no client constants) | FAIL (H1 only) | fx admin page itself is correct |
| Approval threshold not hardcoded in client | PASS | wizard delegates to server (`requires_approval` flag in response) |
| VAPID private key absent from client | PASS | only `VITE_*` vars and `/api/push/vapid-public-key` referenced |
| Service worker at `/sw.js` with scope `/` | PASS | `public/sw.js` registered with `scope:'/'` in `src/lib/push-client.ts` |
| Passwords never read back from API | PASS | only login + change + reset endpoints exist |
| Consumer cannot reach admin routes | PASS | `RoleGate` on `/app/*`; consumer mapped to `/portal/*` only |
| Single response envelope `{success,data,message,timestamp}` | PASS | enforced in `src/lib/dahabApi.ts` (`ApiEnvelope<T>`) |
| API base configured via `VITE_API_BASE_URL` | PASS | `src/lib/dahabApi.ts:9` |
| Auth token plumbing pluggable | PASS | `setAuthTokenProvider` in `src/lib/dahabApi.ts` |
| `src/lib/api/*` per-area modules built | FAIL | only the scaffold `src/lib/dahabApi.ts` exists |
| Vault scoping = the 10 official vaults | NEEDS SERVER ENFORCEMENT | docs require `kind='vault' AND is_active=1 AND source_entry_type_id IS NOT NULL`; frontend trusts whatever `/api/vaults` returns |
| Cash history uses `transactions WHERE transaction_category='cash'` | PASS | server endpoint must mirror |
| Contra account references treated as audit-only | PASS | no UI uses contra for vault math |
| Currency enum stable (`LYD`, `USD`, `EUR`) — `GBP` not yet supported | INCONSISTENT | `src/lib/dahabApi.ts:Currency` still lists `GBP` while DB enum excludes it |

---

## 4. Endpoints documented but not exercised by frontend

These are referenced in `docs/API_CONTRACT.md` but no page calls them today.
They are required by the SQL Server objects you listed and must exist on
Lambda before cutover:

- `GET /api/push/vapid-public-key` → `{publicKey}` (only the public key).
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` —
  DAHABDB has `app_password_events`; ensure Lambda writes one row per event.
- `POST /api/internal/notifications/tick` — to replace the current
  `notifications-tick` server route (HMAC-signed body).
- `POST /api/holder-accounts/:id/withdraw-limit` → must call
  `sp_set_holder_withdraw_limit` and append to `holder_account_limit_events`.
- `POST /api/transactions` (withdraw path) → must internally call
  `sp_validate_holder_withdrawal` before `post_transaction`.

---

## 5. Required pre-cutover actions (no code edits in this turn)

Order matters.

1. **Resolve §0 stack contradiction.** Confirm SQL Server is canonical and
   archive the Postgres scripts, OR confirm Postgres and ignore the SQL
   Server object list. Frontend audit is unaffected either way.
2. **Build the per-area API modules** under `src/lib/api/` per
   `docs/BACKEND_ADAPTER_PLAN.md`. Wire `setAuthTokenProvider` to the new
   auth provider.
3. **Delete hardcoded blocks H1, H3–H10** from `src/routes/app.index.tsx`
   and `src/routes/app.reports.tsx`. Replace each with a `useQuery` against
   the corresponding documented endpoint. Loading skeletons already exist.
4. **Gate H11** demo creds placeholder behind `import.meta.env.DEV`.
5. **Remove `src/routes/api/public/admin/seed-demo.ts`** before publishing
   the SQL Server build.
6. **Server-enforce vault scoping** (`kind='vault' AND is_active=1 AND
   source_entry_type_id IS NOT NULL`) inside the Lambda for `/api/vaults*`.
7. **Decide GBP**: drop `GBP` from `Currency` in `src/lib/dahabApi.ts` or
   add it to the DAHABDB currency enum + FX seed.
8. Page-by-page swap order: read-only first
   (`audit → reports → vaults → holders → dashboard`), then write paths
   (`new tx → approvals → fx-rates`), portal last.

---

## 6. Final statement

- **Frontend is structurally ready** for HTTPS/Lambda cutover: envelope,
  token plumbing, role gating, money handling, and SW/push are correctly
  shaped.
- **Two hard blockers remain** before "API mode" can be flipped on:
  the hardcoded blocks in §2 (H1, H3–H10) and the missing `src/lib/api/*`
  per-area adapter modules.
- **One Needs-confirmation item:** §0 — SQL Server vs Postgres canonical
  engine.

No source files were modified by this audit.
