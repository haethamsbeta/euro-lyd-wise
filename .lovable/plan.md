## Goal

Provide working admin credentials and seed realistic demo data so the app can be tested end-to-end immediately.

## 1. Demo users (created via Lovable Cloud Auth)

Create three pre-confirmed users with known passwords, then assign roles in `user_roles`:

| Role     | Email                  | Password      | Purpose                       |
| -------- | ---------------------- | ------------- | ----------------------------- |
| admin    | admin@demo.test        | Admin#12345   | Approves, manages users       |
| teller   | teller@demo.test       | Teller#12345  | Posts deposits/withdrawals    |
| auditor  | auditor@demo.test      | Auditor#12345 | Read-only audit + ledger view |
| consumer | consumer@demo.test     | Customer#1234 | Customer portal view          |

These will be created using the admin API (service role) inside a one-shot SQL migration that calls `auth.admin.create_user`-equivalent inserts is not allowed directly — instead we'll use a server-side seeding script that runs against the Lovable Cloud Auth admin API, then a SQL migration assigns roles + seeds the rest.

## 2. Demo ledger data (SQL migration)

Seed the following idempotently (guard with `ON CONFLICT` / `WHERE NOT EXISTS`):

- **Vaults** (kind=`vault`):
  - Cash Vault — USD, EUR, LYD
  - Bank Vault — USD, EUR, LYD
  - Wire Vault — USD
  - Each with a starting `account_balances` row of 1,000,000 minor units (USD/EUR) / 5,000,000 (LYD) so deposits/withdrawals work.

- **Customer accounts** (kind=`customer`, auto-numbered):
  - "Layla Hassan" (owned by consumer@demo.test) — USD + LYD balances
  - "Omar Khalifa" — LYD balance
  - "Sara Ahmed" — USD + EUR balances
  - "Mohamed Ali" — USD balance, with a small debit limit
  - "Fatima Saleh" — EUR balance

- **Transactions** (call `post_transaction` as the teller):
  - 6 posted deposits (mix of cash/bank, mix of currencies, varying amounts)
  - 4 posted withdrawals (within balance)
  - 2 pending withdrawals (over balance → routed to approvals queue)
  - 1 large transaction (above default threshold) to demonstrate the alert

- **Notification preferences**: insert default rows for the three staff users so the bell + push toggles are pre-populated.

- **Audit log**: a few seeded entries are produced automatically by `post_transaction` / approval calls, so no extra inserts needed.

## 3. Admin credentials banner on the Login page

Add a small dismissible "Demo credentials" card under the sign-in form listing the four logins with one-click "Fill" buttons. Only shown when no user has signed up yet would be ideal, but simpler: always show it, gated behind a `VITE_DEMO_MODE` flag set to `true` so it can be hidden later. Include a copy-to-clipboard action.

## 4. How seeding runs

Because Lovable Cloud Auth users can't be created from a pure SQL migration, use a **TanStack server route** at `/api/public/admin/seed-demo` (POST, protected by a one-time `SEED_TOKEN` env var) that:

1. Uses `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })` for each demo user — idempotent (skip if user already exists).
2. Inserts the matching `user_roles` rows.
3. Calls a SQL function `seed_demo_ledger(admin_id, teller_id, consumer_id)` (created in a migration) that inserts vaults, customer accounts, balances, and demo transactions in one transaction — also idempotent.
4. Returns a JSON summary of what was created vs. skipped.

Then call this endpoint once from the dev sandbox so the demo data is live. The endpoint stays available so you (or QA) can re-seed at any time without re-running the AI.

## Technical details

- **New migration**: enums already exist; just add `seed_demo_ledger(uuid, uuid, uuid)` SECURITY DEFINER function + role grants.
- **New file**: `src/routes/api/public/admin/seed-demo.ts` — server route, verifies `x-seed-token` header against `process.env.SEED_TOKEN`, then performs steps 1–3.
- **New secret**: `SEED_TOKEN` (any random string, requested via add_secret).
- **Updated file**: `src/routes/login.tsx` — add demo credentials card with Fill / Copy buttons.
- **Auto-confirm**: passing `email_confirm: true` to the admin API bypasses the email verification step, so the demo accounts can sign in immediately without changing project-wide auth settings.

## Result

After approval and one click of "Run seed", you can sign in as `admin@demo.test / Admin#12345` and immediately see vaults, ~5 customer accounts, posted transactions, pending approvals, audit entries, and notifications.
