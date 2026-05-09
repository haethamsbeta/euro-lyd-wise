## Goal
Make the frontend ready to connect to SQL Server DAHABDB via Lambda/API, without breaking the running Supabase-backed preview today.

## Strategy: dual-backend toggle (mirrors existing `authService` pattern)
The codebase already ships `src/lib/authService.ts` that switches between `supabase` and `lambda` via `VITE_AUTH_BACKEND`. I will extend that pattern app-wide:

- New env flag: `VITE_DATA_BACKEND = "supabase" | "lambda"` (default `supabase`).
- Each `src/lib/api/*` module exports a typed function. Internally it routes to either `apiFetch(...)` (lambda) or the existing `supabase.from/rpc(...)` call (supabase).
- Routes import only from `src/lib/api/*` — never from `@/integrations/supabase/*` directly.
- When `VITE_DATA_BACKEND=lambda` is set in the AWS environment, every page automatically uses the Lambda API. No further code change needed for cutover.

This satisfies the user's intent ("frontend must use Lambda/API endpoints through apiFetch") **without** taking the live Supabase preview offline before the API exists.

## Work items

### A. Adapter layer (15 files under `src/lib/api/`)
`auth.ts, dashboard.ts, holders.ts, accounts.ts, transactions.ts, approvals.ts, vaults.ts, reports.ts, audit.ts, users.ts, groups.ts, portal.ts, push.ts, notifications.ts, admin.ts`

Each exports the functions used by today's routes; behind the flag it either calls `apiFetch` or falls back to the existing supabase query. Adapter signatures match what pages already destructure (so route diffs are minimal).

### B. Hardcoded business values — remove now (no flag)
1. `src/routes/app.index.tsx` Network Pulse (lines 205–210): drop `USD*4.85 + EUR*5.3`. Replace with `api.reports.liquidityHealth()`. If `missing_rates.length > 0`, render the existing card layout but show "FX rates required — set rates" linking to `/app/admin/fx-rates`.
2. `src/routes/app.reports.tsx` H3–H10: replace each static array (`hourlyTraffic, cashFlow, tellers, processingTimeDist, errorRateTrend, riskMetrics, riskTypology, kyc/aml targets`) with `useQuery` against `api.reports.*`. Empty/loading/error states use existing skeleton + EmptyState components — no UI redesign.
3. `src/routes/login.tsx` H11: keep demo Fill buttons but only render under `import.meta.env.DEV`.

### C. Page migration to adapters
Switch the following routes' imports from `@/integrations/supabase/client` to `@/lib/api/*`:
`/app, /app/holders, /app/holders/$id, /app/accounts/$id, /app/transactions, /app/vaults, /app/vaults/$id, /app/reports, /app/audit, /app/users, /app/settings/notifications`.

Write paths (new tx, approvals, corrections, portal, admin) stay on supabase for this PR and are tracked in V2 audit as remaining work.

### D. Auth contract
Add `src/lib/api/auth.ts` matching the 6 endpoints listed. The existing `authService.lambda.ts` keeps working; this adapter is what `authService.lambda` calls internally.

### E. Push & notifications
- `src/lib/api/push.ts` — wrap the 10 push endpoints. `push-client.ts` keeps working unchanged because it already speaks the same shapes. Confirm no admin endpoint returns `endpoint/p256dh/auth` or VAPID private key (server code already redacts; will re-verify).
- `src/lib/api/notifications.ts` — list/markRead/prefs.

### F. Server route cleanup
- `src/routes/api/public/admin/seed-demo.ts`: wrap the entire handler in `if (!import.meta.env.DEV) return 404`. (Cannot delete — would break dev seeding.)
- `src/routes/api/public/hooks/notifications-tick.ts`: replace supabase RPC with HMAC-signed `POST` to `${INTERNAL_API_BASE}/api/internal/notifications/tick` using `process.env.INTERNAL_WEBHOOK_SECRET`. Falls back to current behavior in dev when secret unset.

### G. Currency
Keep `GBP` in `src/lib/dahabApi.ts` `Currency` type. No change needed (already present).

### H. Deliverable doc
`docs/SQLSERVER_READINESS_AUDIT_V2.md` listing: removed hardcoded blocks, adapter file inventory, per-route migration status, remaining `supabase.*` references with reason, blockers (API not yet live, env vars to set, write paths still pending).

## Out of scope (called out in V2)
- Migrating write/mutation paths (new transaction wizard, approvals, FX rates admin, holder create) — needs API contracts confirmed first.
- Cognito swap in `authService.lambda.ts` — already stubbed.
- Removing `@/integrations/supabase/*` files — can't until cutover is verified.

## Risk
- Bundle size grows (~15 small files).
- Adapters double-implement each call (supabase + lambda branch). Acceptable for cutover window; the supabase branch deletes after go-live.
- No UI regression: route components keep identical query keys, return shapes, and JSX.

If you approve, I'll execute A–H in one pass and produce the V2 audit at the end.
