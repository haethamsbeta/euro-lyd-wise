## Goal

The Users/Roles page is for managing **DAHAB Family portal staff** (admin / teller / auditor). The "Add" button there must create a **new DAHAB Family member with a role** — not a consumer. Consumer account creation moves out of this page entirely and will live only on the consumer portal accounts page.

This is a functionality + relabel change. No design changes, no Supabase writes (lambda mode stays gated).

---

## 1. New page: `src/routes/app.users.new.tsx`

Replaces the consumer-creation entry point from the Users page. Admin-only (`RoleGate allow={["admin"]}`).

Form fields (matches the contract the user already specified):
- `username` (required, unique, lowercase trim)
- `email` (required)
- `display_name` (required)
- `role` — select: `admin | teller | auditor` (required, no `consumer` option here)
- `status` — select: `active | disabled` (default `active`)
- `must_change_password` — checkbox (default `true`)
- Temporary password (generated, regen button) — sent in payload

Submit calls `POST /users` via the lambda API client (see step 3).

Lambda-mode behaviour:
- If the endpoint exists → call it, toast success, navigate back to `/app/users`, invalidate `users.profiles`.
- If endpoint returns 404/501 → keep the existing "Backend endpoint pending" alert pattern and disable submit.

Supabase mode:
- Disabled with a tooltip "Use the backend (Lambda) to create staff members." We are not wiring a Supabase staff-create path — Supabase mode is legacy/dev only.

## 2. `src/routes/app.users.tsx`

- Replace the "Add consumer account" button. New button: **"Add DAHAB member"** linking to `/app/users/new` (the new staff-create page).
- Remove the `Link to="/app/users/new-consumer"` from this page.
- Helper line under the search row: *"DAHAB Family portal users (admin, teller, auditor) are created here. Consumer accounts are created from the Consumer Portal Accounts page."*
- Add i18n keys `users.addMember` (en/ar).

## 3. API client + endpoints

Add to `src/lib/api/users.ts`:

```ts
create: (body: {
  username: string;
  email: string;
  display_name: string;
  password: string;
  role: "admin" | "teller" | "auditor";
  status?: "active" | "disabled";
  must_change_password?: boolean;
}) => apiFetch<AppUser>("/users", { method: "POST", body: JSON.stringify(body) }),

setRole: (id, role) => apiFetch(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
setStatus: (id, status) => apiFetch(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
forcePasswordReset: (id) => apiFetch(`/users/${id}/password-reset`, { method: "PATCH" }),
```

(Existing `createConsumer`, `setRoles[]`, `setActive`, `forcePasswordReset` POST stay until consumer-portal-accounts page is rewired in a separate change.)

## 4. Consumer-creation route

Keep `src/routes/app.users.new-consumer.tsx` file in place for now (no link points to it from Users page anymore) — it will be moved/relinked from the Consumer Portal Accounts page in a follow-up. Out of scope for this turn.

## 5. Docs

Update `docs/USERS_ROLES_LAMBDA_CUTOVER.md` and append to `docs/API_CONTRACT.md` under **Users & roles (admin)**:

```text
POST   /users                          create DAHAB Family staff member
       body: { username, email, display_name, password,
               role: admin|teller|auditor,
               status?: active|disabled,
               must_change_password?: boolean }
       resp: { success, data: { id, username, email, display_name,
               role, status, must_change_password, created_at },
               message: "User created." }

PATCH  /users/:id/role                 { role }
PATCH  /users/:id/status               { status }
PATCH  /users/:id/password-reset       force reset link
PATCH  /users/:id/email                { new_email }
POST   /users/:id/test-push            send test push
GET    /users/:id/push-status          push subscription status
```

Note: every write must insert an `audit_log` row (mirrors the `consumer.create` audit row pattern in `adminCreateConsumer`).

## Out of scope

- Moving consumer creation to the Consumer Portal Accounts page (next turn).
- Lambda backend implementation (backend team).
- Push / email-change / reset rewiring to lambda (already gated, separate cleanup).
- Any design changes.

## Acceptance

- Users page button reads **"Add DAHAB member"**, opens `/app/users/new`.
- New page lets admins create a staff user with role `admin | teller | auditor` (no `consumer` option).
- In lambda mode, submit calls `POST /users`; on 404/501 shows pending-endpoint alert.
- No Supabase `user_roles` insert is attempted from the Users page.
- Consumer creation no longer reachable from `/app/users`.
- Endpoint contract documented in `API_CONTRACT.md` and the cutover doc.
