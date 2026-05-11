# Master Admin Test Sandbox

A new Master Admin-only page for end-to-end test fixtures, gated behind `useShowMasterTools()` (real master + not previewing as regular). Lambda only — no Supabase, no mocks.

## 1. API adapter

Extend `src/lib/api/admin.ts` with a `testFixtures` namespace:

- `create()` → `POST /admin/test-fixtures/e2e` returns
  `{ test_run_id, holder: {id, name, dahab_account_number}, holder_accounts: [{id, currency_code}], vaults: [{id, currency_code, name}] }`
- `cleanup(testRunId)` → `DELETE /admin/test-fixtures/:testRunId`

Use real currency codes only: LYD, USD, EUR, GBP. No client-side fixture generation — backend owns shape.

## 2. Route

New file `src/routes/app.admin.test-sandbox.tsx`:

- Route: `/app/admin/test-sandbox`
- Component guard: redirect to `/app` if `!useShowMasterTools()`. Render nothing while auth still loading.
- Section header: "Test Sandbox" with subtitle explaining `is_test=true / source_system=DAHAB_TEST` markers.

### Layout (single page, three cards)

**Card 1 — Fixture lifecycle**
- Button: "Create E2E Test Fixture" → `api.admin.testFixtures.create()`
- Stores response in local state + `sessionStorage` key `dahab.testFixture` so reload preserves it.
- Button: "Cleanup Fixture" (destructive) — disabled until fixture exists, calls cleanup then clears state.
- Shows toast with backend `message` (success and error) verbatim.

**Card 2 — Fixture details** (visible after creation)
- Test Holder row: name + dahab number + "Open Test Holder" link → `/app/holders/$id`
- Linked Test Accounts: list each `{currency_code, id}` with "Open" → `/app/accounts/$id`
- Test Cash Vaults: list each `{currency_code, name, id}` with "Open" → `/app/vaults/$id`
- Display `test_run_id` as monospace chip.

**Card 3 — Transaction tests** (visible after creation)
Currency selector (LYD/USD/EUR/GBP) + amount input. Three actions, each posts via `api.transactions.postCash` using the fixture's holder account + vault for the chosen currency:

1. "Run Test Cash Deposit" — direction `deposit`, normal amount, expects `status=posted`.
2. "Run Test Cash Withdrawal" — direction `withdraw`, normal amount, expects `status=posted`.
3. "Run Pending Approval Test" — withdrawal with deliberately large amount (e.g. 10× current balance or hard-coded high value, configurable input), expects backend to return `status=pending`. Show actual returned status, mark pass/fail by comparing to expected.

Each action appends to an in-page "Test results" log (timestamp, action, returned txn id, status, message). No mock data — only backend response shown.

## 3. Navigation entry

In `src/components/app/app-shell.tsx`:
- Add nav item `{ to: "/app/admin/test-sandbox", labelKey: "nav.testSandbox", icon: FlaskConical, roles: ["admin"] }`.
- Filter NAV with extra predicate: items whose `to` starts with `/app/admin/test-sandbox` only render when `useShowMasterTools()` is true (regular admins and preview-as-regular masters won't see it).
- Add i18n key `nav.testSandbox: "Test Sandbox"` in both `src/lib/i18n/en.ts` and `ar.ts`.

## 4. Error handling

Wrap every Lambda call with try/catch:
- On `ApiError` 404/501: show `<BackendPending>` block inline (Master Admin only sees this page anyway, so always show technical detail with endpoint name).
- Other errors: toast with backend `message`.
- Success: toast with backend `message`.

## 5. Out of scope

- No Supabase fallback.
- No client-side currency invention.
- No changes to regular admin UI.
- No backend changes (endpoints assumed live per request).

## Files

- new `src/routes/app.admin.test-sandbox.tsx`
- edit `src/lib/api/admin.ts` (add `testFixtures`)
- edit `src/components/app/app-shell.tsx` (gated nav entry)
- edit `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts` (label)
