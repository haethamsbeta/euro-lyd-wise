## Goal

Isolate sandbox pending approvals from production approvals. The Test Sandbox page reads sandbox pending transactions from the dedicated sandbox endpoint and renders them read-only until backend exposes sandbox approve/reject endpoints.

## Scope

- Frontend only.
- `/app/admin/test-sandbox` only.
- Master Admin gating unchanged. `TX_POSTING_DISABLED` stays `true`.
- No changes to `/app/approvals` (production page is untouched).

## Changes

### 1. `src/lib/api/admin.ts`

Add a new method on `adminApi.testFixtures`:

- `transactions(testRunId)` → `GET /admin/test-fixtures/:testRunId/transactions`
- Defensive unwrap; returns `{ items, pending_items, posted_items, totals }` (each array defaulted to `[]`).
- No call to `/activity`, `/activity-lite`, or `/approvals` from sandbox code.

### 2. `src/routes/app.admin.test-sandbox.tsx`

- Add `pendingTxQuery = useQuery(["admin","test-fixtures",test_run_id,"transactions"], …)`, enabled only when a fixture is active.
- Replace the "Pending test transactions" section currently sourced from `activity-basic.pending_transactions` with rows from `pendingTxQuery.data.pending_items` (fall back to filtering `items` by `status === "pending"` if `pending_items` is absent).
- Render each pending row read-only. No Approve / Reject / Modify buttons. Add a section badge:
  - "Sandbox approval endpoint pending." (small warning chip near the section header)
- Show empty state when there are no pending sandbox transactions.
- Loading: skeleton inside the section. Error: `BackendPending` for `GET /admin/test-fixtures/:testRunId/transactions` with retry.
- Refetch after `createFixture()` and via the existing "Refresh activity" button (refetch both `activityQuery` and `pendingTxQuery`).
- Keep recent posted transactions read-only, sourced from `activity-basic.transactions` (unchanged).

### 3. Production approval page (`src/routes/app.approvals.tsx`)

No code change. Filtering of `is_test`, `source_system = DAHAB_TEST`, `test_run_id` prefix `TEST-`, `TST-H-*` accounts, and `TST-V-*` vaults is a backend responsibility on `GET /approvals/pending`. Add a one-line code comment noting the backend contract; no client-side filter logic.

## Out of scope

- Re-enabling sandbox transaction posting (`TX_POSTING_DISABLED` stays `true`).
- Sandbox approve/reject UI (deferred until backend exposes
  `POST /admin/test-fixtures/:testRunId/transactions/:txId/approve|reject`).
- Any Supabase usage.
- Any change to non-admin routes.

## Acceptance

- Network tab on `/app/admin/test-sandbox` shows `GET /admin/test-fixtures/:testRunId/activity-basic` and `GET /admin/test-fixtures/:testRunId/transactions`. No call to `/approvals/*`, `/activity`, or `/activity-lite`.
- Pending sandbox transactions render read-only with the "Sandbox approval endpoint pending." badge.
- No Approve / Reject / Modify controls on sandbox pending rows.
- Master Admin gating and disabled Deposit / Withdraw / Pending buttons unchanged.
- `/app/approvals` is unchanged.