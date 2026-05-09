# SQL Server (DAHABDB) Readiness Audit — V2

Date: 2026-05-09
Scope: post-implementation snapshot after the V1 audit
(`docs/SQLSERVER_READINESS_AUDIT.md`).

Backend target: AWS Lambda / API Gateway → SQL Server **DAHABDB**.
Frontend rule: every business value displayed must come from the API via
`apiFetch`. No client-side FX, no hardcoded KPIs, no demo numbers in
production.

---

## 1. Hardcoded business values — status

| ID | Location | Issue (V1) | V2 status |
|----|----------|-----------|-----------|
| H1 | `src/routes/app.index.tsx` Network Pulse (was lines 205–211) | `lyd + usd*4.85 + eur*5.3` client-side FX | **REMOVED** — now fetches `api.reports.liquidityHealth()`; renders backend `network_total_lyd_minor` or "—" + missing-rates CTA to `/app/admin/fx-rates`. |
| H2 | `src/routes/app.index.tsx` ~line 949 | Decorative visual primitives, no numbers | NO CHANGE — non-business. |
| H3 | `app.reports.tsx` `hourlyTraffic` | static 11-row array | **REMOVED** — `api.reports.hourlyTraffic()`. |
| H4 | `app.reports.tsx` `cashFlow` | static 7-row array | **REMOVED** — `api.reports.cashFlow()` (minor → display via `/100`). |
| H5 | `app.reports.tsx` `tellers` leaderboard | static 6-teller demo | **REMOVED** — `api.reports.tellersToday()`. |
| H6 | `app.reports.tsx` `processingTimeDist` | static 5-bucket array | **REMOVED** — `api.reports.processingTimeDistribution()`. |
| H7 | `app.reports.tsx` `errorRateTrend` | static 7-day array | **REMOVED** — `api.reports.rejectionRateTrend()`. |
| H8 | `app.reports.tsx` `riskMetrics` | hardcoded counts (23/8/14/3) | **REMOVED** — `api.reports.complianceOverview().{flagged_txns,…}`. |
| H9 | `app.reports.tsx` `riskTypology` | static 4-row mix | **REMOVED** — `api.reports.complianceOverview().typology` (frontend only attaches palette). |
| H10 | `app.reports.tsx` KYC/AML/Doc/Sanctions targets | hardcoded targets | **REMOVED** — sourced from `complianceOverview().{kyc,aml,doc_verification,sanctions}`. |
| H11 | `src/routes/login.tsx` Demo Fill | demo creds shown to all visitors | **GATED** — `<DemoCredentials>` only renders when `import.meta.env.DEV`. Static dev creds only; no password retrieval. |
| — | `app.reports.tsx` `approvalTrend`, `txnMix`, `alertVolume` | small purely decorative chart fixtures, NOT in user's H-list | NO CHANGE this PR — flagged below as residual cleanup once API endpoints exist. |
| — | `app.index.tsx` Sparkline `seed` arrays (line 241) | per-card cosmetic sparkline | NO CHANGE — purely decorative micro-visual; not labelled as a business number. To be replaced with real series when `api.reports.currencyTrend()` lands. |

**No frontend file performs FX multiplication anymore.**

---

## 2. API adapter modules created

All under `src/lib/api/`. Each calls `apiFetch` from `src/lib/dahabApi.ts`
(reads `VITE_API_BASE_URL`, injects `Authorization: Bearer <token>` from
`setAuthTokenProvider`, unwraps `ApiEnvelope<T>`).

| File | Surface area |
|------|--------------|
| `_shared.ts` | re-exports `apiFetch`, `ApiError`, `Currency`, `qs()` helper. |
| `auth.ts` | login, logout, me, change-password, reset-password, forgot-password. |
| `dashboard.ts` | admin/teller/auditor snapshots. |
| `holders.ts` | list, get, create, update, accounts, addAccount, totals. |
| `accounts.ts` | get, ledger, setWithdrawLimit, statementPdfUrl. |
| `transactions.ts` | list, get, myRecent, post (idempotent), correct. |
| `approvals.ts` | pending, approve, reject. |
| `vaults.ts` | list, get, recentActivity, **consolidatedUsd** (returns missing_rates, never falls back to 1:1), branches, targets, plus `fxRatesApi.{list,set}`. |
| `reports.ts` | liquidityHealth, hourlyTraffic, cashFlow, tellersToday, processingTimeDistribution, rejectionRateTrend, complianceOverview. |
| `audit.ts` | list (with q/from/to/entity/user_id pagination). |
| `users.ts` | list, get, createConsumer, setRoles, setActive, forcePasswordReset. |
| `groups.ts` | list, get, members, addMember, removeMember, create. |
| `portal.ts` | me, accounts, totals, ledger, statement (server-enforced owner scoping). |
| `push.ts` | 10-endpoint contract; admin endpoints documented to never expose endpoint/p256dh/auth/VAPID_PRIVATE_KEY. |
| `notifications.ts` | list, markRead, markAllRead, prefs, updatePrefs. |
| `admin.ts` | imports.{list,rows,upload,post}, branches.{list,create,setActive}. |
| `index.ts` | barrel: `import { api } from "@/lib/api"`. |

`Currency` type in `src/lib/dahabApi.ts` retains **GBP** as required.

---

## 3. Routes migrated to apiFetch (this PR)

| Route | Migration |
|-------|-----------|
| `/app` | Network Pulse FX → `api.reports.liquidityHealth()`. Other dashboard panels still on supabase (read-only KPIs from `useDashData()`). |
| `/app/reports` | All charts H3–H10 sourced from `api.reports.*`. The supplementary `useReportsData()` aggregator still calls supabase to keep header KPIs lit while the API is being implemented. |
| `/login` | Demo Fill UI gated to `import.meta.env.DEV`. |
| `/api/public/admin/seed-demo` | Hard-disabled outside `NODE_ENV === development`. |
| `/api/public/hooks/notifications-tick` | Now HMAC-POSTs to `${INTERNAL_API_BASE_URL}/api/internal/notifications/tick` when configured; falls back to local Postgres RPC only in dev. |

---

## 4. Routes NOT yet migrated (residual `supabase.*`) — by reason

The following 31 modules still import `@/integrations/supabase/client` /
`client.server`. None of them claim hardcoded business values; they all do
real DB I/O that maps 1:1 to an adapter listed in §2. Migration is mechanical
(swap import + call shape) and is staged across follow-up PRs because the
Lambda backend is not yet live and we cannot dual-test today.

| Route / module | Adapter to swap to | Reason still on supabase |
|---|---|---|
| `app.holders.index.tsx` | `api.holders.list` | API not live |
| `app.holders.$id.tsx` | `api.holders.{get,accounts,totals}` | API not live |
| `app.holders.new.tsx` | `api.holders.create` | write path — needs API contract validation |
| `app.accounts.$id.tsx` | `api.accounts.{get,ledger}` | API not live |
| `app.transactions.index.tsx` | `api.transactions.list` | API not live |
| `app.transactions.$id.tsx` | `api.transactions.{get,correct}` | write path |
| `app.vaults.index.tsx` | `api.vaults.list` | API not live |
| `app.approvals.tsx` | `api.approvals.{pending,approve,reject}` | write path |
| `app.audit.tsx` | `api.audit.list` | API not live |
| `app.users.tsx` | `api.users.*` | privileged writes need contract sign-off |
| `app.groups.index.tsx`, `app.groups.$id.tsx` | `api.groups.*` | API not live |
| `app.admin.branches.tsx` | `api.admin.branches.*` | write path |
| `app.admin.fx-rates.tsx` | `api.fxRates.{list,set}` | write path; gates Network Pulse — high prio |
| `app.me.activity.tsx` | `api.transactions.myRecent` | API not live |
| `app.portal-accounts.tsx` | `api.portal.accounts` | API not live |
| `app.settings.notifications.tsx` | `api.notifications.{prefs,updatePrefs}` + `api.push.*` | API not live |
| `portal.tsx`, `m.dashboard.tsx`, `m.login.tsx`, `reset-password.tsx`, `login.tsx`, `app.index.tsx`, `app.reports.tsx` | mix of `api.portal.*`, `api.auth.*`, `api.dashboard.*` | dual-mode pending env flag |
| `components/app/new-transaction-wizard.tsx` | `api.transactions.post` (with `idempotency_key`) | write path |
| `components/app/add-linked-account-dialog.tsx` | `api.holders.addAccount` | write path |
| `lib/auth.tsx`, `lib/authService.supabase.ts` | `api.auth.*` via existing `authService.lambda.ts` | swap is one-line: set `VITE_AUTH_BACKEND=lambda` |
| `lib/notifications.tsx` | `api.notifications.list` + realtime channel | realtime channel needs SSE/WebSocket equivalent in Lambda — **open question** |
| `lib/session-timeout.tsx` | `api.auth.me` heartbeat | trivial |
| `lib/passkey.ts` | already calls `/api/auth/passkey/*` server fns | OK; no change needed |

---

## 5. Per-route readiness matrix (37 routes)

| Route | Hardcoded values | Adapter exists | Migrated | Status |
|-------|------------------|----------------|----------|--------|
| `/` | n/a | n/a | n/a | ready |
| `/about` | n/a | n/a | n/a | ready |
| `/login` | gated DEV-only | `api.auth` | partial (auth still via authService) | ready |
| `/forgot-password` | none | `api.auth.forgotPassword` | no | needs swap |
| `/reset-password` | none | `api.auth.resetPassword` | no | needs swap |
| `/change-password` | none | `api.auth.changePassword` | no | needs swap |
| `/app` | **fixed (H1)** | `api.dashboard`, `api.reports` | partial | ready (Network Pulse), needs swap (other panels) |
| `/app/holders` | none | `api.holders.list` | no | needs swap |
| `/app/holders/$id` | none | `api.holders.*` | no | needs swap |
| `/app/holders/new` | none | `api.holders.create` | no | needs swap (write) |
| `/app/accounts/$id` | none | `api.accounts.*` | no | needs swap |
| `/app/transactions` | none | `api.transactions.list` | no | needs swap |
| `/app/transactions/$id` | none | `api.transactions.*` | no | needs swap (write) |
| `/app/transactions/new`, `/deposit`, `/withdraw` | none | `api.transactions.post` | no | needs swap (write) |
| `/app/approvals` | none | `api.approvals.*` | no | needs swap (write) |
| `/app/vaults`, `/app/vaults/$id` | none | `api.vaults.*` | no | needs swap |
| `/app/reports` | **fixed (H3–H10)** | `api.reports.*` | partial | ready for chart wiring once API live |
| `/app/audit` | none | `api.audit.list` | no | needs swap |
| `/app/users`, `/app/users/new-consumer` | none | `api.users.*` | no | needs swap (write) |
| `/app/groups`, `/app/groups/$id` | none | `api.groups.*` | no | needs swap |
| `/app/admin/branches` | none | `api.admin.branches.*` | no | needs swap (write) |
| `/app/admin/fx-rates` | none | `api.fxRates.*` | no | **HIGH PRIO** — gates dashboard Network Pulse |
| `/app/portal-accounts` | none | `api.portal.accounts` | no | needs swap |
| `/app/me/activity` | none | `api.transactions.myRecent` | no | needs swap |
| `/app/settings/notifications` | none | `api.notifications.*`, `api.push.*` | no | needs swap |
| `/app/settings/security` | none | server fns + `api.push.*` | partial | ready |
| `/app/about` | n/a | n/a | n/a | ready |
| `/portal`, `/portal/$accountId/$currency` | none | `api.portal.*` | no | needs swap |
| `/m`, `/m/login`, `/m/dashboard`, `/m/index` | none | mixed | no | needs swap |
| `/api/public/admin/seed-demo` | n/a | n/a | DEV-gated | safe for prod |
| `/api/public/hooks/notifications-tick` | n/a | HMAC fan-out | wired | ready when `INTERNAL_API_BASE_URL` is set |

---

## 6. Security verifications

- **No DB credentials or AWS keys in `src/`**: `rg "(?:AKIA|aws_secret|DB_PASSWORD|RDS_HOST)" src` → 0 hits.
- **No direct RDS connection from the browser**: confirmed; only `apiFetch` over HTTPS.
- **Passwords never shown**: `DemoCredentials` displays static dev fixtures, not stored values; `api.auth` exposes only login / change / reset / forgot. There is no "retrieve password" endpoint anywhere.
- **VAPID private key**: lives only in server env (`process.env.VAPID_PRIVATE_KEY`) used by `src/server/push.server.ts`. `api.push.adminUserDevices` typed return omits `endpoint`, `p256dh`, `auth`. The Lambda implementer MUST honour this — frontend types will not compile against an enriched payload.

---

## 7. Currency

`Currency = "LYD" | "USD" | "EUR" | "GBP"` retained in
`src/lib/dahabApi.ts`. GBP-bearing imported accounts will display correctly.
GBP report aggregation depends on the SQL Server `currency_code` enum / lookup
table including GBP — **needs confirmation** from the DBA before report SQL
references it.

---

## 8. Final blockers before flipping `VITE_API_BASE_URL` to the live Lambda

1. **Lambda endpoints must be implemented to the shapes in `src/lib/api/*`.** The frontend is the source of truth for response shapes used in §2.
2. **Adapter migration PRs**: 31 modules listed in §4 still call supabase. Order: read-only routes → write routes → realtime.
3. **Auth cutover**: set `VITE_AUTH_BACKEND=lambda` *only* after `src/lib/authService.lambda.ts` is filled in (it currently delegates to `api.auth`).
4. **`run_notification_reminders` replacement**: Lambda must implement `POST /api/internal/notifications/tick` with HMAC verification matching the `X-Signature: HMAC_SHA256(secret, "${ts}.${body}")` scheme used in `src/routes/api/public/hooks/notifications-tick.ts`.
5. **Realtime**: `src/lib/notifications.tsx` uses a Supabase Realtime channel. Lambda backend must expose either an SSE stream or WebSocket gateway; until then, in-app notifications will fall back to polling.
6. **GBP enum confirmation** in DAHABDB (see §7).
7. **`INTERNAL_API_BASE_URL` + `INTERNAL_WEBHOOK_SECRET`** env vars must be set in production before the cron tick is repointed.

---

## 9. Outstanding "Needs confirmation" items

- Canonical engine: README in `database/aws/*` is PostgreSQL but DAHABDB is SQL Server. The Postgres files are reference/contract only and will not be deployed.
- Whether GBP is in the `currency_code` enum of DAHABDB.
- Realtime delivery mechanism (SSE / WebSocket / polling) for notifications.
- IdP for SSO: Cognito vs. customer's Active Directory.

---

**Verdict:** Frontend is **safe to ship** today (no production-visible
hardcoded business numbers, no demo creds, seed disabled in prod, FX cannot
be invented client-side). Cutover to the Lambda backend remains pending the
follow-up adapter-migration PRs in §4 and the live API endpoints.
