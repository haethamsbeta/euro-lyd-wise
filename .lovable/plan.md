## Remaining Reports cleanup

### 1. `src/lib/api/reports.ts`
- `tellersToday()`: tolerate both raw array and `{ items: [...] }` envelope so the route's `items[].*` fields land correctly. Coerce numeric minor-unit fields and default `trend: []`, `branch: null`.
- `complianceOverview()`: also accept `document_verification` key in addition to `doc_verification` (spec uses `document_verification`); keep current null-aware gauge normalization.
- Liquidity `Watch` threshold left at `< 7` days in UI to match the audit doc text — update audit doc to `< 7` (single source of truth).

### 2. `src/routes/app.reports.tsx`
- **Volume by Teller**: wrap chart in `tellers.length === 0 ? <BackendPending endpoint="GET /reports/tellers/today" /> : <chart>` so it does not render an empty bar chart in lambda mode.
- **Tellers podium / leaderboard**: already gated; verify avatar fallback uses real `t.avatar` only (no static initials computed in FE) — if `avatar` missing, render `—`.
- **Compliance KPI tiles**: keep current values (already from real endpoint). Top-level `BackendPending` already shown when all-zero + empty arrays.
- **Saved Reports** static list: keep buttons (UI labels for "Coming soon" cards are presentation, not report data) — confirmed not mock report values.
- Remove leftover stale comment on lines 29–31 mentioning "illustrative demo data" — replace with note that lambda mode is fully wired.
- Confirm no `Math.random`, `supabase`, hardcoded chart arrays remain (grep already clean).

### 3. `docs/LAMBDA_REPORTS_WIRING_AUDIT.md`
Finalize with:
- Full per-widget table (Business / Liquidity / Tellers / Compliance) including Volume-by-Teller and Saved Reports rows.
- Endpoint allow-list: only the 8 `/reports/*` endpoints listed by user.
- Confirmations block:
  - no Supabase report queries in lambda mode
  - no frontend FX math
  - no mock/static report values remain
  - Business, Teller, Compliance fully audited
- Outstanding `BackendPending` widgets with exact missing fields.

### 4. Verify
- Run `bunx tsc --noEmit` (typecheck only, build runs automatically).
- Report changed files.

### Out of scope
No design changes, no section removals, no new endpoints, no mock data, no Supabase fallbacks, no FX calculation.