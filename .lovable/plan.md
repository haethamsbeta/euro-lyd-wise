Plan to fix the Reports page crash:

1. Diagnose and patch the render-time crash in `src/routes/app.reports.tsx`
   - Keep the existing route/component and the visible marker `REPORTS COMPONENT VERSION: LIVE-LAMBDA-REPORTS-V3`.
   - Add safe normalization before any render logic so every report feed has the requested defaults:
     - `businessOverview = {}`
     - `dailyVolume7d = []`
     - `currencyDistribution = []`
     - `customerGrowth7m = []`
     - `topAccounts = []`
     - `volumeByCurrency30d = []`
     - `cashFlowRows = []`
     - `hourlyRows = []`
     - `liquidityRows = []`
     - `tellerRows = []`
     - `processingRows = []`
     - `rejectionRows = []`
     - `alertVolumeDaily = []`
     - `riskTypology = []`
   - Guard all risky render operations currently present in the reports page, especially array calls like `.map`, `.length`, `.reduce`, `.some`, `.filter`, and object calls like `Object.keys(...)`.
   - The highest-risk current lines are the array assumptions around cash flow, liquidity, tellers, processing/rejection rows, and compliance typology/alert rows.

2. Make each widget fail independently instead of crashing the whole page
   - Keep all sections visible.
   - If a query errors, show that widget’s existing `ReportEmpty`/`BackendPending` state only for that widget.
   - Leave Approval Speed as:
     - endpoint `GET /reports/approval-speed`
     - note `Approval-speed endpoint not yet implemented.`
   - Leave Transaction Mix as:
     - endpoint `GET /reports/transaction-mix`
     - note `Transaction-mix endpoint not yet implemented.`
   - Do not add mock data, frontend FX, or backend changes.

3. Fix compliance adapter aliases in `src/lib/api/reports.ts`
   - Accept both `alert_volume_daily` and `alertVolumeDaily`.
   - Accept both `risk_typology` and `riskTypology`.
   - Normalize alert rows from `{ day, alert_count, resolved_count?, pending_count? }` into chart-safe rows.
   - If `resolved_count` is missing, render alert volume only and mark resolution trend/backend resolution data as pending rather than inventing values.
   - Normalize risk typology rows from `{ type, count }` into the existing chart shape.

4. Add temporary safe preview logging
   - Log exactly one safe status object in the reports page using guarded lengths:
     - `businessOverviewKeys`
     - `dailyVolume7d`
     - `currencyDistribution`
     - `topAccounts`
     - `cashFlowRows`
     - `hourlyRows`
     - `liquidityRows`
     - `tellerRows`
     - `complianceAlertRows`
     - `complianceRiskRows`
     - `processingRows`
     - `rejectionRows`
   - Keep it clearly marked as temporary preview debugging.

5. Validate after implementation
   - Let the automatic typecheck/build harness run.
   - Open `/app/reports` in the preview with an authenticated session if available.
   - Confirm the marker is visible and the page renders real backend data or per-widget empty/pending states.

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>