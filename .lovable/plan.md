## Goal

Produce a complete, evidence-based audit of every DAHAB Lambda-mode page, mapping each UI element (card, table, chart, KPI) to the **endpoint** and **DAHABDB field** it currently reads, the endpoint/field it *should* read, and the exact fix. Then apply only the safe frontend mapping fixes. No redesign, no removed sections, no mock data, no Supabase fallback in lambda mode, no fabricated values.

The deliverable is a single audit document plus a prioritized fix pass.

## Deliverable

`docs/LAMBDA_FULL_ENDPOINT_AND_BALANCE_AUDIT.md` containing six tables exactly as the brief specifies:

1. Page endpoint matrix — `Page | Current endpoint | Correct endpoint | Status | Fix`
2. Balance-source matrix — `UI element | Current field | Correct field | Correct endpoint | Status`
3. Dashboard metric matrix — `Metric/card | Current source | Correct source | Backend returned? | Fix`
4. Reports metric matrix — `Widget/chart | Endpoint | Fields | Current status | Fix`
5. Currency audit — `Location | Current fallback | Correct behavior | Fix`
6. Priority list — P0 wrong balances/totals, P1 wrong dashboard/report metrics, P2 missing details, P3 future write features

## Audit scope (every route enumerated)

`/app` (`app.index.tsx`), `/app/holders`, `/app/holders/$id`, `/app/holders/new`, `/app/accounts` (linked accounts list), `/app/accounts/$id`, `/app/transactions`, `/app/transactions/$id`, `/app/transactions/new/*`, `/app/vaults`, `/app/vaults/$id`, `/app/reports`, `/app/audit`, `/app/approvals`, `/app/users`, `/app/admin/fx-rates`, `/app/admin/branches`, `/app/settings/notifications`, `/app/settings/security`, `/app/me/activity`, `/app/portal-accounts`, `/app/groups`, `/portal`, `/portal/$accountId/$currency`, `/m`, `/m/dashboard`.

For each route I will list every section/card/table/chart, the current adapter call + field reads, the correct adapter call + field reads per the rules in section A of the brief, and the verdict (correct / wrong endpoint / wrong field / loaded-page-as-total / missing endpoint / mapping-only fix).

## Known issues already visible from a first pass (will be confirmed and itemised in the doc)

- `m.dashboard.tsx`, `portal.tsx`, `portal.$accountId.$currency.tsx`, `app.transactions.$id.tsx`, `app.me.activity.tsx`, `app.audit.tsx`, `app.approvals.tsx`, parts of `app.reports.tsx` and `app.index.tsx` still query Supabase directly with no `DATA_BACKEND === "lambda"` branch — Supabase fallback in lambda mode, must be replaced with the corresponding Lambda adapter call and a backend-pending state when the endpoint is missing.
- Vault detail (`app.vaults.$id.tsx`) already follows the cash_vault_effect_minor → amount_minor rule and uses backend `balance_minor` for the summary — verify and confirm.
- Vault list (`app.vaults.index.tsx`) — confirm it shows all 10 single-currency vault accounts from `/vaults` (not 3 design cards) and uses `balance_minor` directly.
- Holder list / holder detail — confirm `/holders/:id/totals` is the source for holder totals and `summary.linked_account_count` is used for the linked account chip (recent fix, re-verify).
- Holder accounts global page — confirm `/holder-accounts?limit=&offset=` paged envelope (`total`, `next_offset`) is used and `current_balance` is the row balance.
- Transactions list/detail — confirm `amount_minor` is used as the transaction amount everywhere and never confused with `current_balance`/`balance_after`/`cash_vault_effect_minor`.
- Dashboard KPI cards (`app.index.tsx`) — confirm they read `summary.holder_count`, `holder_account_count`, `transaction_count`, `vault_count`, `pending_count` from `/dashboard/staff` and not from page-row counts; flag any KPI (active_holders, txns_today, cash/bank split, recent activity holder names) that the backend does not return as "backend extension needed".
- Reports — confirm every widget maps to a `/reports/*` endpoint and that cash-flow rows are pivoted in the frontend by day+currency+direction; no static arrays used as live data; no FX math in the frontend; compliance/teller gauges show backend-pending when fields are absent.
- Currency fallbacks — `rg` already shows no `"UNK"` literal; full audit will still grep for `|| "UNK"`, `|| "Unknown"`, `currency_code ||`, hard-coded `"USD"` defaults (e.g. `app.vaults.index.tsx:271` uses `v.currency_code ?? "USD"` — that is a fabricated currency fallback and must become "Currency missing").

## Process

1. Read every route file and adapter listed above (parallel reads).
2. For each section/card/table, record current endpoint+field and compare to the rules in brief section A. Record the verdict.
3. Write the six tables into `docs/LAMBDA_FULL_ENDPOINT_AND_BALANCE_AUDIT.md`.
4. Apply only **safe frontend mapping fixes** where the backend already returns the correct field. Examples expected:
   - replace remaining Supabase queries in lambda mode with Lambda adapter calls + `BackendPending` for missing endpoints (`m.dashboard`, `portal.*`, `app.transactions.$id`, `app.me.activity`, `app.audit` already-fixed verify, `app.reports` Supabase branches, etc.)
   - remove any `currency_code ?? "USD"` / `?? "UNK"` style fallbacks and replace with a "Currency missing" badge
   - ensure transaction rows never display `balance_after` / `current_balance` / `cash_vault_effect_minor` as the transaction amount
   - ensure holder-accounts list uses paged envelope `total` instead of `items.length`
   - ensure dashboard KPI cards never derive totals from the loaded `recent_transactions` / first holder page
5. For backend gaps, list the exact endpoint and exact fields the backend must add (no UI removal, render `BackendPending` until live).
6. Re-run `bunx tsc --noEmit` and update `docs/NEXT_BACKEND_ENDPOINTS_WIRING.md` cross-reference.

## Out of scope

- No redesigns, no removed sections, no new mock data.
- No write endpoints wired (approve/reject/post stay disabled in lambda mode until backend confirms).
- No FX math in the frontend.
- No Supabase reads in lambda mode after the fix pass.

## Risks / open questions

- A few routes (portal, m.dashboard, app.audit, app.me.activity) currently *only* support Supabase. If the corresponding Lambda endpoints don't exist yet, the lambda-mode behavior will be a `BackendPending` card for those sections — please confirm that's acceptable rather than leaving the Supabase path active in lambda mode.
- `app.reports.tsx` has a large Supabase branch behind `enabled: DATA_BACKEND !== "lambda"` — that branch is fine to keep for non-lambda mode; the audit only flags lambda-mode behavior.