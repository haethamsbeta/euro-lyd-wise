## Goal

Wire FX Rates, Audit, Approvals, Reports gaps, and Notifications to the Lambda backend without removing UI sections. When an endpoint is missing/404, show a clear "Backend endpoint pending" empty state — never invent data, never fall back to Supabase in lambda mode. Document the wiring status in `docs/NEXT_BACKEND_ENDPOINTS_WIRING.md`.

## Cross-cutting helpers

### 1. Detect "endpoint missing" vs real errors
- `apiFetch` already throws `ApiError` with `.status`. Treat `status === 404` (or status `0`/network when DEV) as "pending" → render the pending state. All other errors → render normal error message.
- Add a tiny shared helper file `src/components/app/backend-pending.tsx` exporting:
  - `<BackendPending endpoint="GET /admin/fx-rates" note="..." />` — neutral card with monospace endpoint + short explanation.
  - `isPendingError(err)` → returns true if `ApiError.status === 404`.

No changes to `_shared.ts` or `dahabApi.ts`.

## Page changes (lambda mode only — Supabase branches stay untouched for non-lambda dev)

### 2. `src/routes/app.admin.fx-rates.tsx`
- Replace the Supabase query with a `DATA_BACKEND === "lambda"` branch calling `api.fxRates.list()`.
- Map backend `FxRate { base, quote, rate, effective_at, set_by_user_id }` into the existing card/history shape (currency = `base` when `quote === 'USD'`, `usd_rate = rate`, `as_of_date = effective_at`).
- On 404 → render `<BackendPending endpoint="GET /admin/fx-rates" />` for both the rate cards row and the history table; keep the "Add rate" button visible but disable it with a tooltip "Backend write endpoint pending".
- Keep existing dialog UI; in lambda mode, the Save mutation calls `api.fxRates.set(...)`. If 404, surface `toast.error("Backend endpoint pending: POST /admin/fx-rates")` and don't call Supabase.
- Do NOT calculate consolidated USD anywhere on this page.

### 3. `src/routes/app.audit.tsx`
- Already calls `api.audit.list()` in lambda mode but swallows errors with `catch → []`. Replace the `try/catch` with a real error path:
  - On 404 → render `<BackendPending endpoint="GET /audit" />` instead of cards.
  - On other errors → small error card with message.
- Keep PDF export builder; on 404 also surface a toast "Backend endpoint pending: GET /audit".
- Remove the lambda-mode `catch → []` so empty list ≠ "no data" (real empty result still renders the existing "No audit entries yet." card).

### 4. `src/routes/app.approvals.tsx`
- Currently 100% Supabase. Add a `DATA_BACKEND === "lambda"` branch that:
  - Lists via `api.approvals.pending({ limit: 100 })`.
  - On 404 → `<BackendPending endpoint="GET /approvals/pending" />` and **disable** Approve / Reject / Partial buttons with a title attribute "Backend write endpoints pending".
  - When list works but write endpoints aren't ready, keep the buttons disabled in lambda mode for now (we don't have status detection for writes until the user clicks). Simpler: in lambda mode, render the Approve/Reject/Partial buttons disabled with tooltip "Approval write endpoints not enabled yet"; we'll re-enable in a follow-up once `POST /approvals/:id/approve` is confirmed live.
- Map backend `Transaction` shape into the row shape used by the JSX (tx_number, direction, channel, currency, amount_minor, requested_amount_minor, review_reason, comment, created_at).
- Supabase branch stays as-is for non-lambda dev.

### 5. `src/routes/app.reports.tsx` — gaps
- Lambda branch in `useReportsData` already returns zeros — leave as-is (no fabrication). Add a small `<BackendPending endpoint="GET /reports/overview" />` ribbon above the Business KPI strip when `__lambdaEmpty` is true so the empty zeros aren't mistaken for real numbers.
- `useTopAccounts` is gated `enabled: DATA_BACKEND !== "lambda"` — leave gated; in the Top Accounts card, when in lambda mode and array is empty, show `<BackendPending endpoint="GET /reports/top-accounts" />` inside the card body. Do NOT remove the card.
- For Tellers lens: when `tellers.length === 0` in lambda mode → `<BackendPending endpoint="GET /reports/tellers/today" />` inside the existing leaderboard card (keep card chrome).
- For Compliance lens: when `compliance.flagged_txns === 0 && typology.length === 0 && alert_volume.length === 0`, show pending state inside the compliance section with `endpoint="GET /reports/compliance/overview"`. Do NOT fabricate KYC/AML targets — already zeroed when backend missing.
- Remove the unused module-scope `approvalTrend`, `txnMix`, `alertVolume` mock arrays in lambda mode by gating their usage behind `DATA_BACKEND !== "lambda"` (keep arrays for legacy dev mode). Where these arrays feed charts, swap to `compliance.alert_volume` / empty in lambda mode and render the pending state when empty.

### 6. `src/routes/app.settings.notifications.tsx`
- Add a lambda-mode branch for `prefs` query: call `api.notifications.prefs()`. On 404 → render `<BackendPending endpoint="GET /notifications/prefs" />` inside the preferences card; disable the Save button.
- Devices list (`push_subscriptions`): in lambda mode call `api.push.adminStatus()` for VAPID configured + counts. If 404 → `<BackendPending endpoint="GET /admin/push/status" />` inside the devices card. Per-device list endpoint isn't available yet → show pending state for the per-user device table only in lambda mode.
- Push enable/disable buttons: keep functional only when `vapid_configured === true`; otherwise disable with tooltip.

## Documentation

### 7. Create `docs/NEXT_BACKEND_ENDPOINTS_WIRING.md`
Markdown table with columns: `Page | Expected endpoint | Adapter call | Current status | Frontend behavior until live`. Rows for each item above:

```
| /app/admin/fx-rates | GET /admin/fx-rates | api.fxRates.list() | pending | BackendPending card; Add Rate disabled |
| /app/admin/fx-rates | POST /admin/fx-rates | api.fxRates.set() | pending | toast on submit; no Supabase fallback |
| /app/audit | GET /audit | api.audit.list() | pending | BackendPending card; export disabled |
| /app/approvals | GET /approvals/pending | api.approvals.pending() | pending | BackendPending; write buttons disabled |
| /app/approvals | POST /approvals/:id/approve|reject | api.approvals.approve/reject() | pending | buttons disabled with tooltip |
| /app/reports | GET /reports/overview | (none yet) | pending | KPI ribbon shows pending |
| /app/reports | GET /reports/top-accounts | (none yet) | pending | top accounts card empty-state |
| /app/reports | GET /reports/tellers/today | api.reports.tellersToday() | live (may be empty) | empty → BackendPending |
| /app/reports | GET /reports/compliance/overview | api.reports.complianceOverview() | live (may be empty) | empty → BackendPending |
| /app/settings/notifications | GET /notifications/prefs | api.notifications.prefs() | pending | BackendPending; save disabled |
| /app/settings/notifications | GET /admin/push/status | api.push.adminStatus() | pending | BackendPending; enable disabled if VAPID missing |
```

Plus a short "Conventions" section describing `BackendPending` and the "404 = pending" rule.

## Out of scope

- No backend changes.
- No redesign of cards or page layouts.
- No mock data, no Supabase fallback in lambda mode.
- Approval write endpoints (`approve`/`reject`) stay disabled in lambda mode until backend confirms — covered in follow-up turn.
- No realtime/poll changes.

## Acceptance verification

- With Lambda configured but the four pending endpoints missing, every page renders without console errors and shows `BackendPending` cards naming the exact endpoint.
- No "fake" rates / audit rows / approvals / charts appear in lambda mode.
- `bunx tsc --noEmit` passes.
- `docs/NEXT_BACKEND_ENDPOINTS_WIRING.md` exists with the table above.