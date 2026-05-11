# Next Backend Endpoints Wiring

Status of backend endpoints required by Lambda-mode pages. When an endpoint
returns 404/501, the frontend renders a `BackendPending` card naming the
exact endpoint instead of fabricating data.

## Wiring matrix

| Page | Expected endpoint | Adapter call | Status | Frontend behavior until live |
|------|-------------------|--------------|--------|------------------------------|
| `/app/admin/fx-rates` | `GET /admin/fx-rates` | `api.fxRates.list()` | pending | `BackendPending` replaces rate cards + history; "Add rate" disabled |
| `/app/admin/fx-rates` | `POST /admin/fx-rates` | `api.fxRates.set()` | pending | Submit shows toast `Backend endpoint pending: POST /admin/fx-rates`; no Supabase fallback in lambda mode |
| `/app/audit` | `GET /audit?limit&offset&from&to` | `api.audit.list()` | pending | `BackendPending` card; PDF export emits empty rows + toast |
| `/app/approvals` | `GET /approvals/pending` | `api.approvals.pending()` | pending | `BackendPending` card; no fake rows |
| `/app/approvals` | `POST /approvals/:id/approve` \| `POST /approvals/:id/reject` | `api.approvals.approve/reject()` | pending | Approve / Reject / Partial buttons disabled with tooltip "Approval write endpoints not enabled yet" |
| `/app/reports` (Business) | `GET /reports/overview` | none yet (`useReportsData` zeroes out) | pending | `BackendPending` ribbon above KPI strip; holders/transactions still come from `dashboard.summary` |
| `/app/reports` (Business) | `GET /reports/top-accounts` | none yet (`useTopAccounts` gated off in lambda) | pending | `BackendPending` inside Top Accounts card |
| `/app/reports` (Tellers) | `GET /reports/tellers/today` | `api.reports.tellersToday()` | live (may be empty) | When empty in lambda → `BackendPending`; podium + leaderboard hidden until rows exist; KPI strip shows "—" + "Backend pending" |
| `/app/reports` (Compliance) | `GET /reports/compliance/overview` | `api.reports.complianceOverview()` | live (may be empty) | When all metrics zero → `BackendPending`; Compliance Health bars show "—" instead of fabricated 96.2% / 100% / 92.8% / 88.4% |
| `/app/settings/notifications` | `GET /notifications/prefs` | `api.notifications.prefs()` | pending | Whole page replaced by two `BackendPending` cards in lambda mode (Supabase prefs branch only used in non-lambda dev) |
| `/app/settings/notifications` | `GET /admin/push/status` | `api.push.adminStatus()` | pending | Same as above; per-user device list endpoint also pending |
| `/app/groups` | `GET /groups` | `api.groups.list()` | pending | `BackendPending` replaces cards grid; "New Group" disabled with tooltip |
| `/app/groups` | `POST /groups` | `api.groups.create()` | pending | Submit shows toast `Backend endpoint pending: POST /api/groups` and an inline `BackendPending` card inside the dialog; no Supabase fallback |
| `/app/groups/$id` | `GET /groups/:id` | `api.groups.get()` | pending | Whole detail page replaced by `BackendPending` |
| `/app/groups/$id` | `GET /groups/:id/members` | `api.groups.members()` | pending | `BackendPending` replaces members list, balances, accounts table |
| `/app/groups/$id` | `GET /groups/:id/activity30d` (optional) | `api.groups.activity30d()` | pending | Recent Activity card + per-currency 30d strip show `BackendPending`; KPI strip shows `—` + "Backend pending" hint |
| `/app/groups/$id` | `PATCH /groups/:id` | `api.groups.update()` / `togglePin()` | pending | Edit / Pin disabled with tooltip; submit toasts pending endpoint |
| `/app/groups/$id` | `DELETE /groups/:id` | `api.groups.remove()` | pending | Delete disabled with tooltip; submit toasts pending endpoint |
| `/app/groups/$id` | `POST /groups/:id/members` | `api.groups.addMember()` | pending | Add Members dialog submit toasts pending endpoint |
| `/app/groups/$id` | `DELETE /groups/:id/members/:holderAccountId` | `api.groups.removeMember()` | pending | Per-row remove toasts pending endpoint |

## Conventions

- **`BackendPending` component** (`src/components/app/backend-pending.tsx`)
  renders a neutral card with a monospace endpoint label. Use it instead of
  empty arrays so empty backend responses are not confused with "endpoint
  missing".
- **`isPendingError(err)`** returns `true` when the error is an `ApiError`
  with `status === 404` or `501`. Page queries use `retry: false` so the
  pending state appears immediately.
- **No mock data** in lambda mode. No Supabase fallback in lambda mode.
- **Write endpoints** stay disabled with a tooltip until the backend
  confirms the corresponding `POST` is live.
- **FX rates** are admin-entered only; the frontend never computes or
  consolidates currency conversions.

## Removing a pending entry

1. Verify the backend endpoint returns `200` with the documented shape.
2. Confirm the adapter call in `src/lib/api/*` already targets the right
   path (most adapters are written ahead of the backend).
3. Update the row in this table from `pending` → `live`.
4. If the page had a `BackendPending` placeholder, the conditional check on
   `isPendingError(error)` (or empty-list guards in `app.reports.tsx`) will
   automatically reveal the real UI once data flows.