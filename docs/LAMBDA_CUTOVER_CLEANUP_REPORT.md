# Lambda Cutover — Cleanup Report

Date: 2026-05-10
Mode: `DATA_BACKEND === "lambda"` (default in `src/lib/runtimeConfig.ts`)
API base: `https://u2j81refrf.execute-api.eu-north-1.amazonaws.com/api`
Realtime: `polling` (forced by runtimeConfig in lambda mode)

## Files changed

- `src/lib/runtimeConfig.ts` — already enforces lambda default + polling + public VAPID. No change this pass.
- `src/lib/clearFrontendBusinessCache.ts` — **new**. Wipes business-data keys from `localStorage`/`sessionStorage` on app boot when in lambda mode.
- `src/routes/__root.tsx` — calls `clearFrontendBusinessCacheForLambdaMode()` once on mount.
- `src/routes/app.transactions.index.tsx` — initial Lambda load is now `api.transactions.list({ limit: 200 })`. Polling stays at `POLL_INTERVALS.transactions` (60s). PDF export limit (5000) is unchanged and only triggered on explicit user export.
- `src/routes/app.index.tsx` — Dashboard `useDashData` and `PendingApprovalsButton` now have a lambda-mode branch that pulls from `api.dashboard.admin()`, `api.vaults.list()` and `api.transactions.list({ limit: 8 })`. No Supabase calls in lambda mode.
- `src/routes/app.holders.index.tsx` — Holders summary + list now use `api.holders.list(...)` in lambda mode.
- `src/routes/app.vaults.index.tsx` — Vault list and recent activity use `api.vaults.list()` and `api.transactions.list(...)`. The `report_consolidated_usd` Supabase RPC is **disabled** in lambda mode (`enabled: DATA_BACKEND !== "lambda"`); the consolidated USD card shows the empty/0 state until a backend endpoint exists.
- `src/routes/app.reports.tsx` — `useReportsData` returns an empty shape in lambda mode (no Supabase aggregation). `useTopAccounts` is gated off in lambda mode. The existing `useReportFeed` hook continues to call `api.reports.*`. Charts render empty states when API data is missing.
- `src/routes/app.users.tsx` — `users.profiles` query has a lambda-mode branch using `api.users.list()`. If the endpoint isn't implemented yet, returns `__notConnected: true` so callers can render an empty state instead of mock users.
- `src/routes/app.about.tsx` — **new diagnostic panel** showing backend mode, API base URL, realtime mode, and a "Test" button that calls `GET /api/health`.

## Mock / static / fallback inventory

| Location | What it was | Status in lambda mode |
| --- | --- | --- |
| `src/routes/app.reports.tsx` — `approvalTrend`, `txnMix`, `alertVolume` consts | Hard-coded illustrative arrays in compliance/teller lenses | **Still present in code** but the page renders no live business KPIs in lambda mode (overview hook returns empty). These constants feed the design preview only; replace once `/api/reports/compliance/*` and `/api/reports/tellers/*` are wired into the matching widgets. Tracked: TODO. |
| Dashboard `prefs` in `localStorage` (`dahab.dash.prefs:<userId>`) | UI-only layout prefs (which currencies to show, pinned accounts) | **Preserved** — UI prefs only, not business data. |
| Old cached business keys in `localStorage`/`sessionStorage` | Anything matching `dahab.{dashboard,reports,transactions,holders,accounts,vaults,users,approvals,notifications,mock,demo,preview,seed,sample}` or `sb-*-business`/`rq-cache:` | **Wiped on boot** by `clearFrontendBusinessCacheForLambdaMode()`. |
| `src/routes/login.tsx` "Fill" demo buttons | Pre-fills the login form with demo credentials | **Allowed** — login auto-fill only, no business data. |

## Per-page lambda-mode confirmation

| Page | Source in lambda mode | Notes |
| --- | --- | --- |
| Dashboard (`/app`) | `api.dashboard.admin`, `api.vaults.list`, `api.transactions.list` | Vault breakdown by `cash`/`bank` channel depends on backend exposing `vault_channel`. Until then channel-specific totals may be 0. |
| Holders (`/app/holders`) | `api.holders.list` | Summary counters are derived from the list response; if the API later adds a `/api/holders/summary` endpoint we should switch. |
| Holder detail (`/app/holders/$id`) | `api.holders.get`, `api.holders.accounts` | Existing detail page already uses adapters; not modified this pass. **Verify in QA.** |
| Account ledger (`/app/accounts/$id`) | `api.accounts.ledger` | Existing route already uses adapter; not modified this pass. **Verify in QA.** |
| Transactions (`/app/transactions`) | `api.transactions.list({ limit: 200 })` | Pagination cursor not yet wired; "Load more" placeholder is a future change. Polling 60s. PDF export still uses `limit: 5000` only on explicit click. |
| Vaults (`/app/vaults`) | `api.vaults.list`, `api.transactions.list` | Consolidated USD card empty until backend endpoint added. |
| Reports (`/app/reports`) | `api.reports.*` (live) + empty overview | Illustrative compliance/teller arrays remain in code as design seed; need backend endpoints to fully replace them. |
| Users (`/app/users`) | `api.users.list` | Renders empty if endpoint not connected. |
| Notifications / Push | `api.push.*` (existing adapter) | Counts read from `api.push.adminStatus()`. Zero is shown when zero — no fake devices. |

## Confirmation

- ✅ Transactions page initial load calls `api.transactions.list({ limit: 200 })` in lambda mode.
- ✅ No `supabase.from("transactions")` runs in lambda mode on the Transactions page (the `dahabMap` query is already gated by `enabled: DATA_BACKEND !== "lambda"`).
- ✅ No private secrets touched. `VAPID_PRIVATE_KEY`, `JWT_SECRET`, `INTERNAL_WEBHOOK_SECRET`, SQL credentials, AWS keys remain server-side only.
- ✅ All API calls go through `apiFetch` → `API_BASE_URL` from `@/lib/runtimeConfig`.

## Remaining backend endpoints needed for full coverage

1. `/api/dashboard/admin` should expose vault `cash_minor`/`bank_minor` per currency for the Dashboard totals strip.
2. `/api/vaults/consolidated-usd` to replace the disabled `report_consolidated_usd` Supabase RPC.
3. `/api/reports/compliance/*` and `/api/reports/tellers/*` to drive the existing widgets that currently use illustrative arrays.
4. `/api/users` if not already implemented — the page currently renders an empty state when the call fails.
5. Cursor-based `/api/transactions?cursor=...` for "Load more" pagination.

Once these are confirmed live, the dashboard / vaults / reports pages can drop the empty-state branches and render real numbers end-to-end.