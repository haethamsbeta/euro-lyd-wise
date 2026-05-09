# DAHAB — AWS Security Requirements

## Credentials & secrets
- AWS access keys, RDS passwords, JWT signing keys, webhook HMAC secrets
  are NEVER in frontend code or `.env` shipped to the browser.
- Store them in **AWS Secrets Manager**; the API loads them at runtime via
  IAM role (no static credentials on disk).
- Frontend `.env` may contain ONLY public values (`VITE_API_BASE_URL`,
  Cognito User Pool ID + Client ID, the publishable Supabase anon key
  during the transition).

## Network
- RDS in **private subnets** only. No `0.0.0.0/0` ingress.
- API in a public ALB / API Gateway with WAF (rate limiting + common rules).
- Browser ↔ API: HTTPS only (HSTS, TLS 1.2+).
- API ↔ RDS: TLS required (`PGSSLMODE=require`).
- S3 attachments bucket: blocked public access; access only via API
  pre-signed URLs.

## Database principal of least privilege
- App connects as `dahab_app` (no superuser, no DDL).
- Reporting BI uses `dahab_readonly` (SELECT only).
- Migrations run as `dahab_migrations` (CI/CD only).
- Master account never used by application code.

## API auth & authz
- All endpoints require a valid Cognito JWT except `/api/public/*`.
- API verifies signature with `JWT_PUBLIC_KEY`; rejects expired/revoked.
- API maps JWT.sub → `SET LOCAL app.current_user_id = '<sub>'` per request,
  so RLS policies activate.
- Role enforcement done **twice**: in API middleware (fast) AND in RLS
  (defense-in-depth).
- Admin endpoints additionally verify `has_role('admin')`.

## Webhooks / cron
- `/api/public/*` endpoints MUST verify HMAC signature (`x-webhook-signature`)
  using `WEBHOOK_SECRET` and `crypto.timingSafeEqual`.
- Never expose unauthenticated mutations.

## Input validation
- Every endpoint validates body + query with Zod (min/max lengths, regex,
  enum). Reject early with 400.
- All UUIDs parsed; reject malformed.

## Output minimisation
- Customer portal endpoints must NEVER include other customers' data.
- Staff endpoints exclude raw email/phone/national_id from list responses
  unless the caller is admin or auditor.
- Audit log details may include amounts/currencies but never PII like
  passwords, JWT, or session tokens.

## Logging & monitoring
- All authentication events, admin actions, financial mutations are logged
  to CloudWatch (structured JSON).
- `audit_log` table additionally stores them durably in the database.
- Set up CloudWatch alarms on: 4xx/5xx spikes, failed-login bursts,
  DB CPU / connections, RDS storage.

## Backups & recovery
- Automated RDS snapshots, 30-day retention; PITR enabled.
- Test restore quarterly into a staging env.
- Encrypt snapshots with the same KMS key as the DB.

## Other
- HTTPS strict; no mixed content.
- CSP set on API responses (`default-src 'none'`).
- No third-party JS in the customer portal.
- Session timeouts respected (idle warning already implemented in the UI).
