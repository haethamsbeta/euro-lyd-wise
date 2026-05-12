## Goal

Enable the full Master-Admin Test Sandbox workflow using only sandbox-isolated endpoints. Add the missing sandbox API methods (`createE2E`, `delete`, `deleteAll`, `transactions(params?)`, `approveTransaction`, `rejectTransaction`), and wire approve/reject controls on pending sandbox transactions. Keep the `TX_POSTING_DISABLED` flag for Deposit/Withdraw/Pending-create buttons.

## Scope (frontend only)

- `src/lib/api/admin.ts`
- `src/routes/app.admin.test-sandbox.tsx`
- New small component for the reject-reason dialog (sandbox-only)

No changes to production routes, no Supabase, no production approvals/transactions calls.

## Changes

### 1. `src/lib/api/admin.ts`

Restructure `adminApi.testFixtures` to expose exactly these methods. All methods unwrap `{ success, data, message }`, return `data`, throw on `success === false`, and URL-encode path params.

- `list()` → `GET /admin/test-fixtures` (keep current normalization to `{ items, total }`)
- `createE2E({ starting_balance })` → `POST /admin/test-fixtures/e2e` with body `{ starting_balance }`. Replaces current `create()` (alias `create` kept for back-compat call sites during this change, then removed).
- `delete(testRunId)` → `DELETE /admin/test-fixtures/:testRunId`. Replaces `cleanup()`.
- `deleteAll()` → `DELETE /admin/test-fixtures` (new; wired to a "Delete all sandbox data" destructive button).
- `activityBasic(testRunId)` → unchanged shape, ensure envelope unwrap.
- `transactions(testRunId, params?)` → `GET /admin/test-fixtures/:testRunId/transactions{qs(params)}`. Returns `{ items, pending_items, posted_items, totals }`.
- `approveTransaction(testRunId, txId)` → `POST /admin/test-fixtures/:testRunId/transactions/:txId/approve`, empty body.
- `rejectTransaction(testRunId, txId, rejectReason)` → `POST /admin/test-fixtures/:testRunId/transactions/:txId/reject`, body `{ reject_reason: rejectReason }`.

Add a small local helper `unwrap<T>(res): T` that returns `res.data` when the response looks like an envelope and throws `new Error(res.message ?? "Request failed")` when `success === false`. Use it from each method.

### 2. `src/routes/app.admin.test-sandbox.tsx`

- Replace calls: `create()` → `createE2E({ starting_balance: 10000 })`, `cleanup(id)` → `delete(id)`.
- Add a new "Delete all sandbox data" destructive button next to "Cleanup Fixture", calling `deleteAll()` with a confirm dialog; on success clear active fixture, refetch `fixturesQuery`.
- Keep `fixturesQuery`, `activityQuery`, `sandboxTransactionsQuery` (rename `pendingTxQuery` → `sandboxTransactionsQuery`). Both activity and transactions queries gated on `showMaster && !!fixture?.test_run_id`.
- Use `sandboxTransactionsQuery.data.items` (or `posted_items`) for the "Recent test transactions" table instead of `activity-basic.transactions` so sandbox history is sourced from the dedicated transactions endpoint. Keep the `activity-basic` totals/balances/accounts/vaults sections as-is.
- For the "Pending test transactions" section, render `sandboxTransactionsQuery.data.pending_items` as a real table with per-row controls:
  - tx_number, direction, amount_minor, vault_role, status, review_reason
  - **Approve** button → calls `approveTransaction(test_run_id, tx.id)`. On success: success toast, refetch `fixturesQuery`, `activityQuery`, `sandboxTransactionsQuery`. On error: toast with backend message.
  - **Reject** button → opens a small Dialog with a Textarea for `reject_reason` (required, non-empty). Submitting calls `rejectTransaction(test_run_id, tx.id, reason)`. Same refetch/error behavior.
  - Remove the "Sandbox approval endpoint pending." badge since endpoints are now live.
- Per-row busy state keyed by `tx.id` so only the active row spins.
- Keep `TX_POSTING_DISABLED = true` and the existing Deposit/Withdraw/Pending create buttons disabled with tooltip. Approve/Reject are NOT gated by this flag.
- Master Admin gating via `useShowMasterTools()` is unchanged: redirect non-master, return null.
- Keep `BackendPending` fallbacks for activity-basic and transactions endpoints when 404/501.

### 3. New component (collocated)

`SandboxRejectDialog` inside the sandbox route file (or `src/components/app/sandbox-reject-dialog.tsx` if reused). Props: `open`, `onOpenChange`, `txNumber`, `onConfirm(reason: string) => Promise<void>`. Built on existing `Dialog` + `Textarea` + `Button` primitives.

## Out of scope

- Re-enabling sandbox transaction posting (`TX_POSTING_DISABLED` stays `true`).
- Any change to `/app/approvals` or production transaction lists.
- Supabase usage.
- Non-admin routes.

## Acceptance

- Network tab on `/app/admin/test-sandbox` shows only:
  - `GET /admin/test-fixtures`
  - `POST /admin/test-fixtures/e2e`
  - `DELETE /admin/test-fixtures/:testRunId`
  - `DELETE /admin/test-fixtures` (when "Delete all" used)
  - `GET /admin/test-fixtures/:testRunId/activity-basic`
  - `GET /admin/test-fixtures/:testRunId/transactions`
  - `POST /admin/test-fixtures/:testRunId/transactions/:txId/approve`
  - `POST /admin/test-fixtures/:testRunId/transactions/:txId/reject`
- No calls to `/activity`, `/activity-lite`, `/approvals/*`, or production transactions list.
- Master Admin sees full page; non-master sees nothing (existing gating).
- Pending sandbox rows can be approved/rejected; on success all three sandbox queries refetch.
- Deposit/Withdraw/Pending create buttons remain disabled.
- Production pages unchanged.

verification checklist:

- 1. Login as Master Admin.
  2. Open:
  /app/admin/test-sandbox
  3. Confirm the page loads and only calls:
  GET /admin/test-fixtures
  GET /admin/test-fixtures/:testRunId/activity-basic
  GET /admin/test-fixtures/:testRunId/transactions
  4. Confirm Network tab shows no calls to:
  - /activity
  - /activity-lite
  - production /approvals
  - production /transactions for sandbox history
  5. Confirm active fixture shows:
  - holder
  - 4 test holder accounts
  - 8 test cash vaults
  - balances by currency
  - totals
  - sandbox transactions
  - pending sandbox transactions
  6. Confirm the existing test transactions show:
  - deposit 100 LYD
  - withdrawal 50 LYD
  - pending/rejected/approved sandbox items if available
  7. Confirm pending sandbox items use only:
  POST /admin/test-fixtures/:testRunId/transactions/:txId/approve
  POST /admin/test-fixtures/:testRunId/transactions/:txId/reject
  8. Confirm non-master users cannot access the Test Sandbox page.