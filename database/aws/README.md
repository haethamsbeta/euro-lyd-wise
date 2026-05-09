# DAHAB — AWS Database (PostgreSQL on RDS)

This folder is the **source-of-truth SQL** to provision a fresh AWS RDS
PostgreSQL instance that satisfies everything the Lovable frontend expects.

## Why RDS PostgreSQL (not SQL Server)

The application code uses PostgreSQL-specific features end-to-end:
- ENUM types (`currency_code`, `tx_status`, `tx_direction`, `vault_channel`,
  `app_role`, `entry_side`, `account_kind`, `notification_event`,
  `notification_severity`, `account_nature`).
- `jsonb` columns (notification preferences, audit log details, FX returns).
- `uuid` PKs with `gen_random_uuid()` (pgcrypto).
- `BIGSERIAL` identity columns and `WITH GROUPING SETS / FILTER` aggregates
  used by reports.
- Row-Level Security policies — every existing migration relies on them.
- PL/pgSQL stored procedures (`post_transaction`, `approve_transaction`, …).

**Recommended target: AWS RDS for PostgreSQL 15+** (Aurora PostgreSQL is also
compatible).

> RDS for SQL Server would require rewriting every enum to `CHECK` constraints
> + lookup tables, every `jsonb` to `nvarchar(max)`, every PL/pgSQL function
> to T-SQL, and replacing RLS with API-layer enforcement. Not recommended
> unless an organisational mandate forces it.

## Required AWS infrastructure

1. **RDS PostgreSQL 15+**, Multi-AZ, encryption at rest (KMS), private
   subnets only.
2. **Secrets Manager** secret `dahab/db/master` holding the master password.
3. **Three DB users** (created in `05_permissions.sql`):
   - `dahab_app` — used by the API layer (least privilege).
   - `dahab_readonly` — used by reporting / BI (SELECT only).
   - `dahab_migrations` — used by CI to run schema migrations (DDL).
   The RDS master account is **never** used by application code.
4. **API layer** (Lambda / ECS Fargate / App Runner) sits between the browser
   and RDS. Browser MUST NOT have RDS credentials.
5. **Cognito** (or any IdP issuing JWTs) for user auth. The API translates
   JWT → `app.current_user_id` GUC for RLS (see `05_permissions.sql`).
6. **S3 bucket** `dahab-tx-attachments` (private, KMS-encrypted) for the
   future attachments feature.

## Environment variables (API layer)

```
DB_HOST=<rds-endpoint>
DB_PORT=5432
DB_NAME=dahab
DB_USER=dahab_app
DB_PASSWORD=<from Secrets Manager>
JWT_PUBLIC_KEY=<Cognito public key>
S3_ATTACHMENTS_BUCKET=dahab-tx-attachments
AWS_REGION=eu-south-1
```

The frontend (`.env`) only needs:
```
VITE_API_BASE_URL=https://api.dahablibya.com
```
**No DB credentials, no AWS keys ever in the frontend.**

## Run order

```
01_schema.sql              -- tables, enums, indexes, FKs
02_views.sql               -- dashboard + report views
03_stored_procedures.sql   -- RPCs the frontend already calls
04_seed_dev_data.sql       -- dev-only sample data
05_permissions.sql         -- roles, GRANTs, RLS policies
06_validation_tests.sql    -- post-deploy smoke tests
```

Run as the `dahab_migrations` user. Example with `psql`:

```sh
export PGHOST=$DB_HOST PGUSER=dahab_migrations PGDATABASE=dahab PGSSLMODE=require
psql -v ON_ERROR_STOP=1 -f 01_schema.sql
psql -v ON_ERROR_STOP=1 -f 02_views.sql
psql -v ON_ERROR_STOP=1 -f 03_stored_procedures.sql
psql -v ON_ERROR_STOP=1 -f 05_permissions.sql
# only for dev/staging:
psql -v ON_ERROR_STOP=1 -f 04_seed_dev_data.sql
psql -v ON_ERROR_STOP=1 -f 06_validation_tests.sql
```

## How frontend / backend connect safely

```
Browser  ── HTTPS ──>  API (Lambda / ECS)  ── TLS ──>  RDS PostgreSQL
    │                          │
    └─ Cognito JWT              └─ runs SET app.current_user_id = '<jwt sub>'
       (Authorization header)      to activate RLS as that user
```

- TLS is mandatory in both legs.
- The API never returns DB row internals other than what the response shape in
  `docs/API_RESPONSE_SHAPES.md` permits.
- All write endpoints call **stored procedures** (never raw INSERT) so audit
  + ledger invariants are enforced inside the database.

## Mapping to the Lovable Cloud project (current)

This SQL mirrors the schema already running on the Lovable Cloud project
(Supabase). If you want to lift-and-shift instead of greenfield, you can:
1. `pg_dump --schema-only` the Lovable Cloud DB and diff against `01_schema.sql` — they should be drift-free.
2. `pg_dump --data-only` the Lovable Cloud DB to migrate live data.

Cutover is API-layer only — no frontend code changes needed if the API
preserves the response shapes in `docs/API_RESPONSE_SHAPES.md`.
