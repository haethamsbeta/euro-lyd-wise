## Goal

Stop reporting `array.length` from limited list endpoints as the database total. Use `/dashboard/staff` summary counts as the source of truth for totals on every page, and clearly label loaded rows as paginated subsets.

## Source of truth

`GET /dashboard/staff` → `summary`:
- `holder_count` → 408
- `holder_account_count` → 659
- `transaction_count` → 23,484
- `vault_count` → 10
- (existing) `pending_approvals`, `txns_today`, `active_holders`

Read with fallbacks (`summary.holder_count ?? summary.active_holders ?? null`) so the UI degrades gracefully if backend hasn't added a field yet. If a total is `null`, render "—" instead of inventing one.

## Changes by file

### 1. `src/lib/api/dashboard.ts`
- Extend `AdminDashboard` with `holder_count`, `holder_account_count`, `transaction_count`, `vault_count` (all `number | null`).
- In the normalizer, pass these through from `summary` with `?? null` (do not default to 0; `0` would be misreported as a real total).

### 2. `src/lib/dahabQueryKeys.ts` (or add a small hook)
- Add a shared `useDashboardSummary()` hook wrapping `api.dashboard.admin()` with `queryKey: ["dashboard.summary"]` so Holders / Transactions / Vaults pages can read totals without each refetching.

### 3. `src/routes/app.index.tsx` (Dashboard)
- KPI cards must read `holderCount`, `holderAccountCount`, `transactionCount`, `vaultCount` straight from the summary, not from `recentTx.length` / `accounts.length`.
- Keep `recentTx` for the recent activity list only; never display its `.length` as a total.

### 4. `src/routes/app.holders.index.tsx`
- Remove `holders: rows.length` as the displayed total. Read `holder_count` and `holder_account_count` from `useDashboardSummary()`.
- Header badge: `Total holders: 408 · Linked accounts: 659 · Showing first {rows.length}`.
- Add a "Pagination coming soon" hint when `rows.length < holder_count`.
- Currency chips (`counts`) keep working but are labelled "in loaded sample" until backend exposes per-currency totals.

### 5. `src/routes/app.transactions.index.tsx`
- Default list call stays `limit: 50` (or whatever current cap is); change footer from `Showing {filtered.length} of {(data ?? []).length} on this page` to `Showing latest {rows.length} of {transaction_count?.toLocaleString() ?? "—"} transactions`.
- Today / pending / posted / failed KPIs that are computed from the loaded rows must be relabelled "in loaded window" or removed; do not present them as DB-wide totals.

### 6. `src/routes/app.vaults.index.tsx`
- Render every row from `api.vaults.list()` (already grouped by id). Confirm no slice/limit on the client. Expected: 10 cards.
- "Active Vaults" KPI: prefer `summary.vault_count`; fall back to `vaults.length`.
- Remove any hard-coded mock cards if present.

### 7. `src/routes/app.reports.tsx`
- Remove the synthesized `total / posted / rejected / rejectionRate / holdersCount` block that is computed from a limited transactions sample.
- For each report tile, if its dedicated `/reports/...` endpoint returns data, render it; otherwise render an empty state ("Not connected yet"). Do not fabricate totals from `tx.length`.

### 8. Audit pass — every page
Search for `.length` used as a "total". Allowed uses: array iteration, empty checks (`=== 0`), sparkline math, "showing N" labels. Forbidden: presenting it as the DB total.

Files to sweep: all `src/routes/app.*.tsx`, `src/routes/m.*.tsx`, `src/components/app/*`, plus `src/routes/portal.*`. For each forbidden use, either swap to a summary count or relabel as "loaded" / "in this page".

### 9. Doc — `docs/LAMBDA_TOTALS_AND_PAGINATION_AUDIT.md` (new)
Table with one row per page:

```text
Page | Endpoint | Limit sent | Currently displayed | Correct total source | Pagination needed?
```

Cover: Dashboard, Holders, Holder detail, Transactions, Transaction detail, Vaults, Vault detail, Reports, Audit, Users, Approvals, Groups, Portal, Mobile dashboard.

## Out of scope
- Building real pagination controls (next/prev, server-side cursors). Plan adds the labels and totals only; pagination UI is a follow-up once backend cursors are confirmed.
- Backend changes — this work assumes `/dashboard/staff` already exposes the four counts. If a field is missing the UI shows "—" and the audit doc flags it.

## Acceptance
- Dashboard shows 408 / 659 / 23,484 / 10 from the summary endpoint.
- Holders page header reads `Total holders: 408 · Linked accounts: 659 · Showing first 100`.
- Transactions footer reads `Showing latest 50 of 23,484 transactions`.
- Vaults page renders 10 cards; "Active Vaults" reads 10.
- Reports page shows real values or empty states, never `tx.length`-derived totals.
- New audit doc lists every page with its endpoint, limit, displayed count, and total source.
