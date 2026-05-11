## Test Sandbox Phase 2 — Isolation Hardening

Backend now returns `vaults[]` with 8 entries per fixture (LYD/USD/EUR/GBP × cash_receivable/cash_payable). Wire the sandbox to use them, enforce strict pairing between test holder accounts and test vaults, and ensure test data never bleeds into production views.

### 1. API types (`src/lib/api/admin.ts`)

Extend `testFixtures.create` and `testFixtures.list` return types so each vault includes `internal_role: "cash_receivable" | "cash_payable"`, `currency_code`, `is_test`, `test_run_id`, `source_system`. Add `vault_count` to list rows. Holder accounts get `is_test`, `test_run_id`, `source_system` too.

### 2. Sandbox page (`src/routes/app.admin.test-sandbox.tsx`)

- Replace `findPair(currency)` with `findReceivable(currency)` and `findPayable(currency)`, both filtered by `internal_role`, `currency_code`, AND `test_run_id === fixture.test_run_id`.
- Deposit → receivable vault id. Withdrawal & pending-approval → payable vault id.
- Disable each transaction button when its required vault is missing. Inline warning "Test vaults required before running transactions." when fixture lacks all 8 expected vaults.
- Group "Test cash vaults" in fixture details by currency, two columns (Receivable / Payable), each with id + copy button.
- Existing Fixtures list: `account_count` and `vault_count` badges; per-row inline actions: Open Holder, Copy Test Run ID, Run Test Deposit, Run Test Withdrawal, Run Pending Approval Test, Delete Fixture. Run actions hydrate the active fixture from the row first.
- Hard guard before every `transactions.postCash`: refuse if `holder_account.is_test !== true`, vault `is_test !== true`, or `vault.test_run_id !== fixture.test_run_id` — surfaces a toast and aborts.

### 3. Strict isolation rule (enforced both ways)

Add a tiny `assertSandboxPair(holderAccount, vault, fixture)` helper inside the sandbox file that throws unless all three carry the same `test_run_id` and both `is_test === true`. This means:

- Test holder accounts can ONLY transact with test vaults from the same `test_run_id` (sandbox enforces it; backend should too).
- Production holder accounts cannot reach test vaults — they're never exposed in the production transaction wizard (see step 4 filter).
- Sandbox cannot accidentally point at a production vault — the dropdown sources strictly from `fixture.vaults`.

### 4. Production isolation (filter test rows out of normal views)

Add `isTestRow(r)` helper in `src/lib/api/_shared.ts`:
`r?.is_test === true || r?.source_system === "DAHAB_TEST" || !!r?.test_run_id`

Apply client-side filtering (defensive — backend should also exclude) in:

- `src/routes/app.vaults.index.tsx` — drop test vaults from the grid and from any client-side totals.
- `src/routes/app.vaults.$id.tsx` — if the loaded vault is a test vault and viewer isn't Master Admin, redirect to `/app/vaults`.
- `src/routes/app.accounts.index.tsx` — drop test holder accounts.
- `src/routes/app.holders.index.tsx` — drop test holders.
- `src/routes/app.transactions.index.tsx` — drop test transactions from the list.
- `src/routes/app.reports.tsx` and any dashboard widget that iterates client-side vault/account/transaction arrays — apply filter before rendering or summing.
- `src/components/app/new-transaction-wizard.tsx` — exclude test holder accounts and test vaults from selectable options so production flows can never target sandbox data.

Server-aggregated metrics (dashboard `cash_by_currency`, liquidity, consolidated totals) are backend-owned — frontend will NOT recompute. Plan note: backend must also exclude `is_test=true` from production aggregates; frontend cannot fix server math.

Master Admin keeps full visibility ONLY inside `/app/admin/test-sandbox`. Everywhere else (including when a Master Admin browses vaults/holders/transactions normally), test rows are hidden so production views stay clean.

### 5. Visibility / role gating

No changes to `useShowMasterTools()`, route gate, or nav — already correct. `RoleGate` on vault/holder pages unchanged. The `isTestRow` filter is role-independent and applies to everyone outside the sandbox.

### 6. Out of scope

- No new backend endpoints beyond the existing `testFixtures` namespace.
- No Supabase reads/writes.
- No fake currencies; only LYD/USD/EUR/GBP.
- No edits to `src/integrations/supabase/*` or auto-generated files.

### Files touched

- `src/lib/api/admin.ts` — extend types, add `vault_count`.
- `src/lib/api/_shared.ts` — add `isTestRow` helper.
- `src/routes/app.admin.test-sandbox.tsx` — receivable/payable routing, per-row actions, strict assert.
- `src/routes/app.vaults.index.tsx`, `app.vaults.$id.tsx`, `app.accounts.index.tsx`, `app.holders.index.tsx`, `app.transactions.index.tsx`, `app.reports.tsx` — filter test rows.
- `src/components/app/new-transaction-wizard.tsx` — exclude test holders/vaults from production transaction options.

&nbsp;

Reinforce Test Sandbox isolation and display rules.

Test Sandbox transactions must affect only:

- the selected test holder account

- the matching test cash vault from the same test_run_id

- test transaction rows

They must never affect:

- production holder accounts

- production cash vaults

- production dashboard metrics

- production liquidity/consolidated totals

- production reports

Frontend must use only vault IDs returned inside fixture.vaults[].

If the selected holder account is test data:

- only show test vaults from the same test_run_id

- never show production vaults

If the selected holder account is production data:

- never show test vaults

Display test accounts clearly:

- show a TEST badge

- show test_run_id

- show source_system = DAHAB_TEST

- visually separate test accounts/vaults from production data

Preferred test account number format:

- holder accounts: TST-H-{CURRENCY}-{sequence}

- vault accounts: TST-V-{CURRENCY}-RCV-{sequence} or TST-V-{CURRENCY}-PAY-{sequence}

Keep Test Sandbox visible only to:

currentUser.role === "admin" && [currentUser.is](http://currentUser.is)_master_admin === true

Hide all test data from regular admin, teller, auditor, and consumer screens.