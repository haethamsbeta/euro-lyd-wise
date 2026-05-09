# DAHAB — Backend Adapter Plan

Goal: be able to switch the frontend from "Supabase JS direct" to "AWS HTTPS
API" without rewriting pages.

## What exists today
| File | What it does | Action |
|---|---|---|
| `src/integrations/supabase/client.ts` | browser Supabase client (DB + auth) | **Keep** for auth (sessions/passkeys) until Cognito migration. Stop using for DB. |
| `src/integrations/supabase/auth-middleware.ts` | server-fn auth context | Keep for now |
| `src/integrations/supabase/client.server.ts` | service-role admin client | Replace with API admin endpoints |
| `src/integrations/supabase/types.ts` | auto-generated DB types | Read-only reference; mirror in `src/lib/api/types.ts` |
| `src/lib/dahabApi.ts` | **AWS API HTTP scaffold (unused)** | Promote into the new `src/lib/api/` family below |
| `src/lib/auth.tsx`, `authService*.ts` | auth glue | Will swap token provider to Cognito JWT |
| Each page `src/routes/app.*.tsx` | calls `supabase.from()` / `supabase.rpc()` directly | Replace each call with the corresponding `src/lib/api/*` function |

## Recommended target structure
```
src/lib/api/
  client.ts          // base fetch + envelope, auth header injection
  types.ts           // mirrors docs/API_RESPONSE_SHAPES.md
  holders.ts         // listHolders, getHolder, createHolder, addHolderAccount, getHolderTotals
  accounts.ts        // getHolderAccount, getLedger, setWithdrawLimit
  transactions.ts    // listTransactions, postTransaction, correctTransaction, myRecent
  approvals.ts       // listPending, approve, reject
  vaults.ts          // listVaults, recentActivity, consolidatedUsd, fx rates, branches, vault targets
  reports.ts         // every report endpoint
  dashboard.ts       // staff/teller/auditor
  imports.ts         // batches + review queue
  audit.ts           // listAudit
  notifications.ts   // list, markRead, markAllRead, prefs, push subs
  portal.ts          // me, totals, ledger, statement
```

`client.ts` should:
1. Read `VITE_API_BASE_URL` (already wired in `dahabApi.ts`).
2. Inject `Authorization: Bearer <jwt>` from a pluggable provider
   (`setAuthTokenProvider`).
3. Unwrap the `ApiEnvelope<T>`, throw `ApiError` on `success=false`.
4. Use `react-query` cache keys defined in `src/lib/dahabQueryKeys.ts`.

## Recommended environment variables
- `VITE_API_BASE_URL=https://api.dahablibya.com`
- `VITE_AUTH_PROVIDER=cognito` (so the auth provider can be branched in code).
- Server only: `JWT_PUBLIC_KEY`, `DB_*`, `S3_ATTACHMENTS_BUCKET`, `WEBHOOK_SECRET`.

## Step-by-step migration order

1. **Build the API** (this folder + `database/aws/` schema). Confirm shapes.
2. **Implement `src/lib/api/*`** (no UI changes). Add `react-query` hooks
   that mirror current `useQuery` shapes.
3. **Page-by-page swap** — replace `supabase.from(...)` / `supabase.rpc(...)`
   with `api.<area>.<fn>(...)`. Order suggested:
   - read-only pages first (audit, reports, vaults, holders list, dashboard)
   - then write paths (new transaction, approvals, corrections, FX rates)
   - last: portal.
4. **Auth swap (separate PR)** — replace Supabase auth with Cognito SDK +
   passkey ceremonies via `/api/auth/passkey/*`. Update `src/lib/auth.tsx`
   token provider to surface the Cognito JWT to `apiFetch`.
5. **Delete dead code** — `client.server.ts`, `seed-demo` route, etc.
6. **Sanity sweep** — `rg "supabase\.(from|rpc)"` should return zero hits in
   pages once migration is complete.

## Risks & warnings
- Mixed period: do NOT call both Supabase + AWS API for the same data on
  the same page; pick one per page during the migration.
- `report_consolidated_usd` already returns the exact shape the frontend
  expects — keep that contract identical.
- The portal expects RLS-style scoping; make sure the API enforces
  `owner_user_id == JWT.sub` server-side, never on the client.
- Don't change `currency_code` enum values without coordinating a frontend
  release — they appear in URLs (`/portal/$accountId/$currency`).
- Number formatting (`formatMinor`) assumes integer minor units. If any new
  endpoint returns decimal strings, frontend math will break.
