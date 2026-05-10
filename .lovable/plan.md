## Lambda Cutover — Cleanup Plan

Goal: when `DATA_BACKEND === "lambda"` (the current default), every business page must read from `https://u2j81refrf.execute-api.eu-north-1.amazonaws.com/api` and never fall back to Supabase, mock arrays, or cached business data.

### Status of files already in good shape

- `src/lib/runtimeConfig.ts` — already enforces lambda default + polling default + public VAPID key. No change needed.
- `src/lib/dahabApi.ts` — uses runtime `API_BASE_URL` via `apiFetch`. OK.
- `src/lib/api/*` adapters — already exist for dashboard, holders, vaults, reports, users, push, transactions. OK.
- `src/lib/api/transactions.ts` — already unwraps `res.items`. OK.

### Changes to ship

**1. Transactions page (`src/routes/app.transactions.index.tsx`)**
- Initial load: `api.transactions.list({ limit: 200 })`.
- In lambda mode: skip the `dahabMap` Supabase query entirely (already gated by `enabled`, but remove from the filter merge so no Supabase call is needed).
- Keep polling at `POLL_INTERVALS.transactions` (60s) — already correct.
- PDF export keeps its own 5000 limit only when the user clicks export.
- Add a "Load more" placeholder button in lambda mode that's disabled with a tooltip "Pagination coming soon" (cursor not yet wired).

**2. Dashboard (`src/routes/app.index.tsx`)**
- Replace `useDashData` with a lambda-mode branch calling `api.dashboard.admin()` / `teller()` / `auditor()` based on role; only fall back to Supabase when `DATA_BACKEND !== "lambda"`.
- `PendingApprovalsButton` and any other Supabase queries: gate with `DATA_BACKEND !== "lambda"` and use `api.approvals` / `api.dashboard` in lambda mode.
- `useTotals`: in lambda mode, derive from `dashboard.admin().totals` directly; do not compute FX.
- If endpoints return empty/missing: show empty/"missing rates" states (already done for liquidity).

**3. Holders (`src/routes/app.holders.index.tsx`, `app.holders.$id.tsx`)**
- Lambda mode: use `api.holders.list` / `api.holders.get` / `api.holders.accounts`.
- Account ledger page: use `api.accounts.ledger` (or matching adapter).
- No Supabase queries in lambda mode; show empty state if the API returns `[]`.

**4. Vaults (`src/routes/app.vaults.index.tsx`, `app.vaults.$id.tsx`)**
- Lambda mode: use `api.vaults.list` and `api.vaults.recentActivity`.
- Render exactly what the API returns (10 official vaults expected). No mock vault rows.

**5. Reports (`src/routes/app.reports.tsx`)**
- Lambda mode: every chart/table fed from `api.reports.*`.
- Empty arrays render empty states; no static sample charts, no fake teller leaderboard, no fake compliance/risk values.

**6. Users (`src/routes/app.users.tsx`)**
- Lambda mode: `api.users.list()`. If it 404s/501s, render "Users endpoint not connected yet" instead of mock rows.

**7. Push / Notifications (`src/routes/app.settings.notifications.tsx`)**
- Lambda mode: `api.push.adminStatus()` for counts; render `0` truthfully when zero. No fake devices.

**8. Startup cache cleanup**
- New `src/lib/clearFrontendBusinessCache.ts` exporting `clearFrontendBusinessCacheForLambdaMode()`.
- Removes `localStorage`/`sessionStorage` keys matching prefixes: `dahab.dashboard`, `dahab.reports`, `dahab.transactions`, `dahab.holders`, `dahab.accounts`, `dahab.vaults`, `dahab.users`, `dahab.mock`, `dahab.demo`, `dahab.preview`, plus any `sb-*-business-cache` style keys that contain business rows.
- Preserves: theme, sidebar, language, push permission, dashboard layout `prefs` (UI-only, no business data).
- Wired into `src/routes/__root.tsx` (or `src/lib/auth.tsx` provider) so it runs once on app boot when `DATA_BACKEND === "lambda"`.
- Dev-only `console.info("DAHAB lambda mode: frontend business cache cleared")`.

**9. Diagnostic panel (dev/preview only)**
- Add a section to `src/routes/app.about.tsx` showing:
  - `Backend mode: {DATA_BACKEND}`
  - `API base URL: {API_BASE_URL}`
  - `Realtime: {REALTIME_MODE}`
  - "Test Backend Connection" button → `apiFetch('/health')` (or `/api/health`) and shows success / message / accepted currencies.
- Hidden in production builds via `import.meta.env.DEV` check OR shown always (it contains no secrets); decision: show always, since it's already public config.

**10. Cleanup report**
- New `docs/LAMBDA_CUTOVER_CLEANUP_REPORT.md`:
  - List every file changed
  - Every mock/static/Supabase fallback found, and whether it's removed/disabled/dev-only
  - Per page confirmation (Dashboard, Holders, Holder detail, Account ledger, Transactions, Vaults, Reports, Users, Notifications)
  - Confirm Transactions loads up to 200 rows from Lambda
  - List endpoints assumed live (and any still TBD)

### Out of scope (explicitly NOT doing)

- No UI redesign.
- No page deletion.
- No Supabase removal — Supabase stays for `DATA_BACKEND === "supabase"` mode and for non-business concerns (auth session helpers, realtime in supabase mode).
- No backend code changes.
- No private secrets touched.

### Risk

The biggest risk is breaking pages where the Lambda response shape doesn't yet match what the page expects (e.g. dashboard `totals` array vs. balances rows). Where shapes don't match, the page will render an empty state rather than crash — every lambda branch will be wrapped in try/catch via react-query's error path with a clear "Endpoint not connected yet" empty card. This is the "fail loud and empty, not silently with mock data" rule the user asked for.

### Approval

Confirm and I'll execute steps 1–10 in order. Estimated 8–10 file edits + 2 new files + 1 doc.
