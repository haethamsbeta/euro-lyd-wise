## Goal

Translate the inside of every page (titles, section headings, KPI labels, table headers, buttons, empty/loading states, toasts, tab labels, helper text) into Arabic — not just the side menu and bottom dock. Keep design, layout, icon placement, and backend payloads unchanged.

## Approach

Existing infra: `src/lib/i18n/{en,ar}.ts` + `useT()` hook. The dock/sidebar already use it. The pages don't — strings are hardcoded English.

Strategy per page:
1. Add new keys to `en.ts` and `ar.ts` under a page namespace (e.g. `reports.*`, `dashboard.*`, `transactions.*`, `vaults.*`, `accounts.*`, `groups.*`, `approvals.*`, `settings.*`, `admin.*`, `portal.*`, `auth.*`).
2. Replace hardcoded strings in the JSX with `t("...")` calls.
3. For backend enums (status, channel, direction, role) keep the existing helpers `tStatus / tChannel / tDirection` and extend if missing values appear.
4. Leave anything that is real backend data (names, account numbers, currency codes, IDs, IBANs) untouched.

## Scope (every page)

Auth & shell
- `login.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `change-password.tsx`
- `m.login.tsx`, `m.dashboard.tsx`, `m.index.tsx`

Main app
- `app.index.tsx` — greeting, KPI titles ("Cash Vaults", "Bank Vaults", "Holdings Summary", "Recent Transactions", "Pinned Customers", "My Queue"), tab labels, empty states
- `app.transactions.index.tsx` + `app.transactions.$id.tsx` + new transaction wizard pages
- `app.holders.$id.tsx` + `app.holders.new.tsx`
- `app.accounts.index.tsx` + `app.accounts.$id.tsx`
- `app.vaults.index.tsx` + `app.vaults.$id.tsx`
- `app.groups.index.tsx` + `app.groups.$id.tsx`
- `app.approvals.tsx` (button tooltips, dialogs)
- `app.reports.tsx` — every section heading ("Reports & Insights", "Daily Transactions", "Balance by Currency", "Peak Hours", "Approval Speed", "Customer Growth", "Top Accounts", "Cash Flow", "Transaction Mix", "Liquidity Health", "Top Performers", "Volume by Teller", "Processing Time Distribution", "Error & Correction Rate", "Compliance Health", "Alert Volume & Resolution", "Risk Typology", "Saved Reports", etc.) plus tab/filter labels
- `app.audit.tsx` (extend existing keys)
- `app.me.activity.tsx`
- `app.users.tsx`, `app.users.new.tsx`, `app.users.new-consumer.tsx`
- `app.settings.notifications.tsx`, `app.settings.security.tsx`
- `app.about.tsx`
- `app.portal-accounts.tsx`
- `portal.tsx`, `portal.$accountId.$currency.tsx`

Admin tools
- `app.admin.branches.tsx`, `app.admin.fx-rates.tsx`
- `app.admin.test-sandbox.tsx` (long page — translate visible labels only, keep diagnostic raw output as-is)

Shared components used inside pages
- `components/app/new-transaction-wizard.tsx`
- `components/app/statement-ledger.tsx` (already partly done — finish remaining strings)
- `components/app/kpi-card.tsx`, `currency-totals-strip.tsx`, `notification-bell.tsx`, `global-search.tsx`, `idle-warning-dialog.tsx`, `add-linked-account-dialog.tsx`, `account-menu.tsx`, `backend-pending.tsx`, `export-pdf.tsx`

## Out of scope (intentionally not touched)

- Backend payloads, table/column names, API field names
- Icon placement, layout, spacing, colors, fonts
- Real data values (names, IBANs, currency codes, IDs)
- Developer-only diagnostic JSON in admin sandbox

## Execution order

Because there are ~14k lines across 28 routes, this will be done in batches so the build stays green:

1. Expand `en.ts` + `ar.ts` with all new namespaced keys.
2. Batch A — Dashboard, Transactions list/detail/new wizard.
3. Batch B — Holders detail/new, Accounts list/detail, Vaults list/detail.
4. Batch C — Reports (largest), Approvals, Audit, My Activity.
5. Batch D — Groups list/detail, Users (list + new + new-consumer), Settings, About.
6. Batch E — Auth pages, Portal pages, Mobile (`m.*`) pages, Admin tools.
7. Batch F — Shared components inside pages.

After each batch: visual sanity check in preview (AR + EN) to confirm no layout regressions.

## Acceptance criteria

- Switching language to Arabic translates every visible heading, label, button, tab, empty/loading message, and toast on every page listed above.
- No icon, button position, color, or layout changes.
- No backend request/response shape changes.
- English remains identical to current copy.
