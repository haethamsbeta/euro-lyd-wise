## Goal

Make `/app/admin/sandbox-multi-entry` (Composite Journal Entry) the single visible sandbox test destination. Leave the existing **Sandbox Transactions** page (`/app/admin/test-sandbox`) untouched per your instruction.

## Scope (what changes)

Only routing/navigation cleanup. The Composite Journal Entry page itself already implements the full builder/review/posting/ledger/reset flow you described — no rebuild.

### 1. Sidebar (`src/components/app/app-shell.tsx`)
- Change the `Sandbox Test` admin nav item from `/app/admin/sandbox-workspace` → `/app/admin/sandbox-multi-entry`.
- Keep the separate `Sandbox Transactions` item pointing at `/app/admin/test-sandbox` (untouched).
- No new sidebar items.

### 2. Internal sandbox tab bar (`src/components/app/sandbox-nav.tsx`)
- Remove the `Workspace`, `Multi-Transaction`, and `Ledger Entries` tabs. Since Composite Journal Entry has its own internal Composite Entry / Transaction Posting toggle, the cross-page tab bar isn't needed anymore.
- Either delete the `<SandboxNav />` rendering on the remaining sandbox pages or strip it down so users don't see the old multi-page choice. The consumer selector / reset workspace / sandbox-mode banner currently inside `SandboxNav` are only used by the legacy workspace pages, so they can be dropped from the multi-entry page (which already has its own sandbox banner and reset).

### 3. Legacy routes — redirect, don't 404
Update three route files to immediately redirect to `/app/admin/sandbox-multi-entry`:
- `src/routes/app.admin.sandbox-workspace.tsx`
- `src/routes/app.admin.sandbox-ledger.tsx`
- `src/routes/app.admin.sandbox-multi-transaction.tsx`

Each becomes a thin file using TanStack Router's `redirect` in `beforeLoad`:

```ts
export const Route = createFileRoute("/app/admin/sandbox-workspace")({
  beforeLoad: () => { throw redirect({ to: "/app/admin/sandbox-multi-entry" }); },
});
```

Old bookmarks land on the Composite Journal Entry page. No broken links.

### 4. Composite Journal Entry page
No changes. The existing `src/routes/app.admin.sandbox-multi-entry.tsx` already covers: 50-customer mock data, vaults/payables/receivables for all 6 currencies, dynamic inflows/outflows, locked-currency picker, per-currency balance validation, ledger preview, mandatory review modal, posting simulation with one shared `TXN-XXXXXXX` id, receipt, internal Composite Entry / Transaction Posting Ledger toggle, posted detail view, reset, examples, and the backend-ready service shims.

If `<SandboxNav />` is currently rendered at the top of that page, remove that import/render so the legacy cross-tab UI no longer appears.

## Out of scope
- `/app/admin/test-sandbox` (Sandbox Transactions) — not touched.
- All non-sandbox pages, design system, auth, production ledger, RDS wiring.
- No new routes, no separate ledger/posting routes, no new sidebar entries.

## Acceptance
- Clicking `Sandbox Test` in the sidebar lands directly on Composite Journal Entry.
- Visiting `/app/admin/sandbox-workspace`, `/app/admin/sandbox-ledger`, or `/app/admin/sandbox-multi-transaction` immediately redirects there.
- No visible Workspace / Multi-Transaction / Ledger Entries tabs anywhere.
- `Sandbox Transactions` menu entry and page still work exactly as today.
