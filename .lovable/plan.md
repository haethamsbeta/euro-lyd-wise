## Goal

Produce a comprehensive missing-data audit at `docs/LAMBDA_MISSING_DATA_AUDIT.md` covering every app page, comparing what the UI expects vs. what the Lambda backend at `https://u2j81refrf.execute-api.eu-north-1.amazonaws.com/api` actually returns. No mock data, no Supabase fallback, no UI redesign.

## Approach

### Phase 1 — Evidence gathering (read-only)

1. **Frontend expectations** — read every page route and its API adapter to extract the exact fields the UI binds to:
   - Routes: `app.index.tsx`, `app.holders.index.tsx`, `app.holders.$id.tsx`, `app.holders.new.tsx`, `app.accounts.$id.tsx`, `app.transactions.index.tsx`, `app.transactions.$id.tsx`, `app.transactions.new.deposit.tsx`, `app.transactions.new.withdraw.tsx`, `app.approvals.tsx`, `app.vaults.index.tsx`, `app.vaults.$id.tsx`, `app.reports.tsx`, `app.audit.tsx`, `app.users.tsx`, `app.groups.index.tsx`, `app.groups.$id.tsx`, `app.portal-accounts.tsx`, `portal.$accountId.$currency.tsx`, `app.admin.fx-rates.tsx`, `app.admin.branches.tsx`, `app.settings.notifications.tsx`, `app.settings.security.tsx`, `app.about.tsx`, `m.dashboard.tsx`.
   - Adapters: `src/lib/api/{dashboard,holders,accounts,transactions,vaults,approvals,reports,audit,users,groups,portal,admin,notifications,push,auth}.ts`.

2. **Backend reality** — probe each live endpoint to capture actual response shapes:
   - Auth once via `/auth/login` (using existing creds in env / known seed user) to obtain a JWT.
   - GET each known-working endpoint with the JWT and small `limit` where applicable: `/dashboard/staff`, `/holders?limit=2`, `/holders/{id}`, `/holders/{id}/accounts`, `/holder-accounts/{id}`, `/holder-accounts/{id}/ledger?limit=2`, `/transactions?limit=2`, `/transactions/{id}`, `/vaults`, `/vaults/{id}`, `/vaults/{id}/activity?limit=2`, `/approvals/pending`, `/users`, `/audit`, `/groups`, `/admin/branches`, `/admin/fx-rates`, `/admin/vault-targets`, `/notifications`, `/reports/business/overview`, `/reports/cash-flow`, `/reports/hourly-traffic`, `/reports/tellers/today`, `/reports/liquidity-health`, `/reports/compliance/overview`, `/reports/processing-time-distribution`, `/reports/rejection-rate-trend`, `/portal/...`.
   - Record HTTP status (200 / 401 / 404 / 500), envelope shape, and exact field names per endpoint.

3. **Diff** — compare expected vs. returned for each page; classify each gap as:
   - **frontend mapping only** (field is in payload but UI doesn't bind / mis-keys it),
   - **backend extension** (endpoint exists, field missing),
   - **new endpoint required** (404 / not implemented).

### Phase 2 — Write the audit document

Create `docs/LAMBDA_MISSING_DATA_AUDIT.md` with:

- **Header** — backend URL, auth method, totals ground truth, audit date.
- **Per-page sections** (one per page in the user's list, 26 pages) following the exact template they specified:
  1. Page + route
  2. Endpoint(s) called
  3. Fields UI expects
  4. Fields backend returns
  5. Missing fields
  6. Fix class (FE / BE-extend / BE-new)
  7. Current UI state (real / empty / dash / wrong)
  8. Recommended fix (specific endpoint + field names)
- **Specific deep-dive subsections** for the six known concerns: Transactions list, Holder accounts, Account ledger, Vaults, Reports, Users.
- **Write-endpoint gap list** — POST/PATCH endpoints needed for: New deposit, New withdrawal, Approve/reject, Set withdraw limit, Set FX rate, Set vault target, Create holder, Add linked account, Correct transaction. Mark each present/absent based on probes.
- **Summary table** with the requested columns:

```text
Page | Missing info | FE fix? | BE fix? | Priority (P0/P1/P2/P3)
```

- **Backend ticket appendix** — consolidated list of required endpoints + response fields, grouped by priority, ready to hand to backend team.

### Phase 3 — Limited frontend-only follow-ups (deferred to build mode)

Out of scope for this plan beyond the doc itself. The audit will end with a section "Frontend mapping fixes safe to apply now" listing only changes where the backend already returns a field that the UI ignores. No code is edited in this loop — the user will trigger a follow-up build pass after reviewing the audit.

## Deliverable

A single new file: `docs/LAMBDA_MISSING_DATA_AUDIT.md` (~26 page sections + tables + backend tickets). No code changes, no mock data, no Supabase fallback work.

## Technical notes

- Probing uses `code--exec` with `curl` against the live API + a JWT obtained via `/auth/login`. Credentials read from env (`compgen -e` to find any DAHAB test user) — if absent, ask user for a test email/password before running probes.
- For unauthenticated 401s on probe, mark endpoint "auth-gated, shape unknown" rather than guessing.
- For 404s, mark "not implemented" — that drives the BE-new classification.
- All counts/totals quoted in the doc come from `/dashboard/staff` summary, never `array.length`.
