## Goal

Produce a **single, authoritative backend specification document** that a backend developer can use to build the AWS RDS + API layer for DAHAB without guessing. It must cover every screen, every metric, every insight, and every endpoint — and explicitly state that **no value is hardcoded in the frontend**; everything is fetched from the backend.

This is documentation only. No UI, schema, or behavior changes.

## Deliverable

One new master file:

```
docs/BACKEND_SOURCE_OF_TRUTH.md
```

Plus a machine-readable companion (so backend tooling can codegen against it):

```
docs/backend/openapi.yaml          # full OpenAPI 3.1 spec for every endpoint
docs/backend/metrics.catalog.json  # every metric/insight with its SQL source + response shape
```

The existing files (`DATABASE_CONTRACT.md`, `API_CONTRACT.md`, `REPORTS_METRIC_MAPPING.md`, `database/aws/*.sql`) stay as-is and are referenced from the master doc.

## Structure of `BACKEND_SOURCE_OF_TRUTH.md`

1. **App architecture overview**
   - Frontend (TanStack Start, Vite) → API gateway → AWS RDS PostgreSQL 15+
   - ASCII diagram of request flow, auth (JWT), RLS, stored procedures
   - Hard rule: **no business value, threshold, FX rate, or metric is hardcoded in the frontend** — everything comes from the API.

2. **Module map** (one row per screen → endpoints + tables it depends on)
   - Auth, Dashboard, Holders, Accounts, Transactions, Approvals, Vaults, Groups, Imports, Reports, Compliance, Audit, Notifications, Admin (Users, Branches, FX rates), Portal.

3. **Complete endpoint catalog** — every route the frontend needs, grouped by module. For each:
   - Method + path
   - Roles allowed
   - Query / body params (typed)
   - Response shape (TS interface name from `API_RESPONSE_SHAPES.md`)
   - Backing SQL view / stored proc
   - Caching hints
   - Pagination contract

4. **Metrics & insights catalog** — exhaustive list of every KPI card, chart, table, and badge in the app. For each metric:
   - Where it appears (route + component)
   - Plain-English definition
   - Exact SQL (view name from `database/aws/02_views.sql` or new SQL to add)
   - Endpoint that returns it
   - Currency rule (per-currency vs USD-consolidated)
   - Refresh cadence / realtime flag
   - "Needs confirmation" flag where business rule is ambiguous

   Covers all metrics from:
   - **Dashboard**: pending count, holders, recent tx, totals by currency × channel.
   - **Vaults**: per-vault balances, Total Consolidated USD (RPC `report_consolidated_usd`), recent activity, days-of-cover, target vs actual.
   - **Reports → Business lens**: B1–B13 (volume, posted, rejected, rejection rate, active holders, volume by currency 30d, daily volume 7d, currency distribution, customer growth 7m, avg LYD txn, top accounts, cash flow, approval speed, transaction mix).
   - **Reports → Tellers lens**: T1–T9 (leaderboard, processing time, rejection trend, liquidity health).
   - **Reports → Compliance lens**: flagged today, pending reviews, resolved today, high-risk holders, alert typology, daily alert volume.
   - **Audit**: counts, action timeline.
   - **Notifications**: unread count, severity breakdown.

5. **FX & consolidation rules**
   - `fx_rates` is **manually entered by admins** — no auto-fetch ever.
   - Consolidated USD computed only via RPC; missing rates returned in `missing_rates[]`; UI links to `/app/admin/fx-rates`.

6. **Data integrity invariants** (reference `DATA_INTEGRITY_RULES.md`)
   - Double-entry, immutable transactions, append-only audit, branch auto-tag trigger, teller daily stats trigger.

7. **Security model**
   - Roles: `admin`, `teller`, `auditor`, `consumer`.
   - JWT claims → `app.current_user_id` / `app.current_role` GUCs → RLS policies.
   - Per-endpoint role matrix.

8. **Backend build checklist** for the developer
   - Run `database/aws/01_schema.sql` → `02_views.sql` → `03_stored_procedures.sql` → `05_permissions.sql`.
   - Implement endpoints in the order of `BACKEND_ADAPTER_PLAN.md`.
   - Validate with `06_validation_tests.sql`.
   - Acceptance: every metric in section 4 returns the documented shape.

9. **Open questions / Needs confirmation** — single consolidated list (active holder definition, internal-transfer direction, GBP support, point-in-time FX, compliance alert rules).

## OpenAPI companion (`docs/backend/openapi.yaml`)

- Full OpenAPI 3.1 with every path from section 3
- Reusable `components.schemas` mirroring `API_RESPONSE_SHAPES.md`
- `securitySchemes: bearerAuth` (JWT), per-operation `security` + role tags
- Common error envelope, pagination params, currency enum

## Metric catalog companion (`docs/backend/metrics.catalog.json`)

Array of objects:
```json
{
  "id": "vaults.total_consolidated_usd",
  "label": "Total Consolidated Balance (USD eq.)",
  "screen": "/app/vaults",
  "endpoint": "POST /api/vaults/consolidated-usd",
  "sql_source": "rpc:report_consolidated_usd()",
  "currency_rule": "usd_equivalent_manual_rates",
  "realtime": false,
  "needs_confirmation": false
}
```
One entry per metric/insight in the app — backend can codegen tests from this.

## What this is NOT

- No UI changes
- No new tables, views, or migrations (those already exist in `database/aws/`)
- No frontend wiring to AWS yet
- No invented business rules — anything ambiguous goes under "Needs confirmation"

## Files to create

- `docs/BACKEND_SOURCE_OF_TRUTH.md` (master doc, ~800–1200 lines)
- `docs/backend/openapi.yaml` (full spec)
- `docs/backend/metrics.catalog.json` (machine-readable catalog)
