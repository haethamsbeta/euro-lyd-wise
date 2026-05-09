# DAHAB — AWS Implementation Handoff

This document is the step-by-step handoff for a backend developer building
the AWS backend that the existing Lovable frontend already expects. It does
**not** redesign anything — it only sequences and references the artifacts
already in this repo.

Companion artifacts (read in this order, do not duplicate):

- `docs/APP_STRUCTURE_AND_BACKEND_REQUIREMENTS.md` — what the app is.
- `docs/DATABASE_CONTRACT.md` — table-by-table contract.
- `docs/REPORTS_METRIC_MAPPING.md` — every report metric → SQL source.
- `docs/API_CONTRACT.md` + `docs/API_RESPONSE_SHAPES.md` — HTTP surface.
- `docs/BACKEND_ADAPTER_PLAN.md` — frontend cutover plan.
- `docs/DATA_INTEGRITY_RULES.md` — non-negotiable accounting rules.
- `docs/AWS_SECURITY_REQUIREMENTS.md` — security baseline.
- `docs/BACKEND_IMPLEMENTATION_SUMMARY.md` — high-level summary.
- `docs/BACKEND_SOURCE_OF_TRUTH.md` — authoritative schema reference.
- `docs/backend/openapi.yaml` — machine-readable API spec.
- `docs/backend/metrics.catalog.json` — machine-readable metrics catalog.
- `database/aws/*.sql` — runnable SQL.

---

## A. Recommended AWS architecture

```
Browser (Lovable / Vercel / Cloudflare hosting)
     |  HTTPS only (TLS 1.2+)
     v
API layer  (AWS Lambda + API Gateway, or ECS Fargate behind ALB)
     |  TLS, private subnet egress
     v
AWS RDS for PostgreSQL 15+ (Multi-AZ, KMS encrypted, private subnets)
     |
     +-- AWS Secrets Manager  -> DB passwords, JWT signing keys, webhook HMACs
     +-- AWS Cognito (or compatible IdP) -> user auth, JWT issuer
     +-- AWS S3 (private, KMS) -> dahab-tx-attachments (future)
     +-- CloudWatch / GuardDuty -> logs, alarms, audit
```

Hard rules:

- Frontend hosting stays where it is today. Browser must NEVER hold RDS
  credentials, AWS keys, or service-role tokens.
- All DB access goes through the API layer. No direct browser → RDS.
- RDS PostgreSQL 15+ is the recommended engine. SQL Server is NOT
  recommended (see `database/aws/README.md` "Why RDS PostgreSQL"); pick it
  only if mandated and budget a full schema rewrite.
- All secrets live in Secrets Manager / SSM Parameter Store, injected as
  env vars at runtime. Never commit secrets.
- API layer enforces JWT verification + role checks before touching the DB,
  and sets `app.current_user_id` per request so RLS activates correctly.

---

## B. Database setup order

Use `psql -v ON_ERROR_STOP=1` for every step. Do NOT reorder — later files
depend on earlier ones.

**Bootstrap (first run only).** The `dahab_app`, `dahab_readonly`, and
`dahab_migrations` roles do not exist yet on a fresh RDS instance, and they
are only created by `05_permissions.sql`. To avoid a chicken-and-egg
problem, the first run of steps 1–4 below MUST be performed by the AWS RDS
master/admin user (the user created with the RDS instance, e.g.
`dahab_master`). That same master user then runs `05_permissions.sql`,
which creates `dahab_migrations`, `dahab_app`, and `dahab_readonly`. From
that point on, all future schema migrations are run as `dahab_migrations`.

> Note: a dedicated `00_bootstrap_roles.sql` file is NOT required, because
> `05_permissions.sql` already provisions every role the app needs. It
> would only be worth adding if you wanted to split role creation away from
> grants/RLS — not needed for the current setup.

Run order:

1. `database/aws/01_schema.sql` — enums, tables, FKs, indexes, triggers.
   Run as the RDS master/admin user.
2. `database/aws/02_views.sql` — dashboard + reports views. Run as the
   RDS master/admin user.
3. `database/aws/03_stored_procedures.sql` — all RPCs the API calls. Run
   as the RDS master/admin user.
4. `database/aws/05_permissions.sql` — creates `dahab_migrations`,
   `dahab_app`, `dahab_readonly` and applies GRANTs + RLS. MUST be run by
   the RDS master/admin user. Run BEFORE seed so seed inserts respect
   grants.
5. `database/aws/04_seed_dev_data.sql` — **dev/staging ONLY, NEVER in
   production.** Run as the RDS master/admin user or as
   `dahab_migrations` (both have the privileges required for the seed
   inserts). Skip entirely in prod.
6. `database/aws/06_validation_tests.sql` — smoke tests; must all pass.
   Run as `dahab_migrations` (or the RDS master user) so writes/RLS
   checks behave like a real migration.

From this point onward, every future schema change is a new timestamped
migration run as `dahab_migrations`. Never edit an existing file in place.

---

## C. Required environment variables (API layer only)

Server-side only. Never expose to the browser.

```
# Database
DATABASE_URL=postgresql://dahab_app:<from-secrets-manager>@<rds-endpoint>:5432/dahab?sslmode=require
DB_HOST=<rds-endpoint>
DB_PORT=5432
DB_NAME=dahab
DB_USER=dahab_app
DB_PASSWORD=<from AWS Secrets Manager — never literal>

# Auth
JWT_ISSUER=https://cognito-idp.<region>.amazonaws.com/<userPoolId>
JWT_AUDIENCE=<cognito-app-client-id>
JWT_PUBLIC_KEY_URL=<JWKS endpoint>     # or JWT_SECRET if HS256

# HTTP
API_BASE_URL=https://api.dahablibya.com
CORS_ALLOWED_ORIGINS=https://www.dahablibya.com,https://dahablibya.com

# AWS
AWS_REGION=eu-south-1
S3_ATTACHMENTS_BUCKET=dahab-tx-attachments

# Webhooks (notifications-tick, etc.)
WEBHOOK_SHARED_SECRET=<from Secrets Manager>
```

Frontend `.env` only needs:

```
VITE_API_BASE_URL=https://api.dahablibya.com
```

---

## D. API implementation order

Build endpoints in this order so each layer can be tested before the next
depends on it. Endpoint shapes are in `docs/API_CONTRACT.md` and
`docs/backend/openapi.yaml`.

1. Auth / session / profile — JWT verify middleware; `GET /api/me`.
2. Roles & permissions — `user_roles` reads; role-gate middleware.
3. Holders — list, get, create.
4. Holder accounts — list per holder, create, aliases.
5. Ledger — read-only ledger per holder account.
6. Transactions — list/get; then `post_transaction` RPC for writes.
7. Approvals — `approve_transaction` / `reject_transaction` /
   `correct_transaction`.
8. Dashboard metrics — read-only views.
9. Reports metrics — every view in `02_views.sql` +
   `report_consolidated_usd()`.
10. Vaults — internal accounts + balances; FX summary.
11. Imports — staging upload, review queue, batch resolve.
12. Audit — append-only read endpoint.
13. Notifications — list, mark-read, push subscriptions, test push.
14. Customer portal — per-user holder + accounts + statements (RLS-locked
    to the authenticated user).

---

## E. Frontend connection order

Drives the cutover described in `docs/BACKEND_ADAPTER_PLAN.md`. Migrate
page-by-page; keep the rest on the current backend until each step is
verified.

1. Login / session.
2. User role loading (`useAuth` → `/api/me/roles`).
3. Read-only holders list (lowest blast radius).
4. Holder detail + linked accounts.
5. Ledger views (read-only).
6. Dashboard read-only metric cards.
7. Transactions (read first → then write via wizard).
8. Approvals (write).
9. Reports page.
10. Vaults, imports, audit, notifications, customer portal — last.

After each step: regression-test the page, confirm role gating, confirm no
browser console errors, confirm no direct `supabase.*` calls remain on
that page.

---

## F. Reports warning (read before building report endpoints)

- NEVER sum LYD + USD + EUR + GBP into a single number. Each currency is
  reported on its own row. The only place a single combined figure is
  allowed is `report_consolidated_usd()`, which uses `fx_rates_current`
  and must label the result as "USD-equivalent (FX as of <timestamp>)".
- All financial metrics are produced by SQL views or stored procedures
  (see `database/aws/02_views.sql` and `03_stored_procedures.sql`). The
  API layer is a thin pass-through.
- The frontend DISPLAYS report data; it does not compute totals,
  averages, or balances for accounting-grade numbers. Any aggregation
  that affects money must originate in the database.
- FX rates are manually curated in `fx_rates`. If no rate exists for a
  currency on the requested date, the API returns `usd_equivalent: null`
  and a `Needs confirmation` flag — never silently fall back to 1:1.

---

## G. Final backend developer checklist

Tick in order. Do not skip ahead.

- [ ] AWS account, VPC, private subnets, KMS key provisioned.
- [ ] RDS PostgreSQL 15+ instance created (Multi-AZ, encrypted, private).
- [ ] Secrets Manager entries created for `dahab/db/master`, JWT keys,
      webhook secrets.
- [ ] `01_schema.sql` ran with no errors.
- [ ] `02_views.sql` ran with no errors.
- [ ] `03_stored_procedures.sql` ran with no errors.
- [ ] `05_permissions.sql` ran; `dahab_app`, `dahab_readonly`,
      `dahab_migrations` roles exist with least privilege.
- [ ] First-run bootstrap performed by the RDS master/admin user for
      steps 01 → 05 (because `dahab_migrations` does not exist until
      `05_permissions.sql` completes).
- [ ] `04_seed_dev_data.sql` ran in dev/staging only (NEVER in prod), and
      was executed by the RDS master/admin user or `dahab_migrations`.
- [ ] `06_validation_tests.sql` passed every assertion.
- [ ] API layer deployed (Lambda / ECS) with all env vars from §C set.
- [ ] JWT verification middleware enforced on every non-public route.
- [ ] `SET LOCAL app.current_user_id` issued per request before any query.
- [ ] Endpoints from §D implemented and covered by integration tests.
- [ ] Role permissions tested: admin, teller, auditor, consumer each see
      only what `docs/DATABASE_CONTRACT.md` allows.
- [ ] Frontend API adapter (`src/lib/api/*` per `BACKEND_ADAPTER_PLAN.md`)
      wired and pointed at `VITE_API_BASE_URL`.
- [ ] Authentication tested end-to-end (login, refresh, logout, password
      reset, must-change-password flow).
- [ ] Reports verified: per-currency totals correct; consolidated USD
      labelled with FX timestamp; no silent currency mixing.
- [ ] Ledger balances verified: `balance_after` is sequentially correct
      per account after every posted ledger entry; sum of debits == sum
      of credits per transaction.
- [ ] No DB credentials, service-role tokens, or AWS keys in any frontend
      bundle (grep the production build).
- [ ] HTTPS enforced everywhere; HSTS on; CORS restricted to listed
      origins.
- [ ] CloudWatch alarms on error rate, RDS CPU, RDS storage, failed
      logins.
- [ ] Backup + quarterly restore drill scheduled.

If any item cannot be confirmed, mark it "Needs confirmation" and stop
before proceeding to the next phase.

---

_Last updated: 2026-05-09. No frontend, route, or schema changes were
made to produce this document — it only references existing artifacts._
