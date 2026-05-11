# Users / Roles — Lambda Cutover Audit

## Read path (live)

- `GET /users?limit=100&offset=0` returns the full user list used by `/app/users`.
- Response shape: `{ items: [{ id, username, email, display_name, status, must_change_password, role, last_login_at, created_at, updated_at }], total, limit, offset, next_offset }`.
- The Users page is **read-only** in lambda mode; the table is populated entirely from this endpoint.

## Incident

The Users page previously called `supabase.from("user_roles").insert(...)` (and several other Supabase admin paths) directly from the frontend. In lambda mode there is no Supabase session, so `auth.uid()` is null and the admin RLS check on `user_roles` rejects the insert with:

> new row violates row-level security policy for table "user_roles"

The same root cause silently breaks revoke-role, reset-password, change-email, push status, and send-test push.

## Decision

- In lambda mode the frontend **must not** perform any Supabase write or Supabase admin call (`from("user_roles")`, `from("profiles")`, `auth.admin.*`, `rpc("admin_*")`, etc.).
- The frontend never bypasses RLS.
- All user/role/status/password mutations must be **backend-owned and audit-logged server-side**. The frontend only triggers the call.
- Until the backend exposes write endpoints, every mutating control on the Users page is rendered **disabled** with the tooltip:

  > User management write endpoint pending.

## Pending backend endpoints

These must exist and be confirmed before the corresponding UI controls are re-enabled:

- `POST /users` — create user (replaces frontend Supabase consumer creation).
- `PATCH /users/:id` — update profile fields (display name, email, etc.).
- `PATCH /users/:id/role` — change a user's role (replaces `user_roles` insert/delete).
- `PATCH /users/:id/status` — activate/suspend.
- `PATCH /users/:id/password-reset` — trigger password reset email + force change.
- `PATCH /users/:id/disable` (or `DELETE /users/:id`) — disable an account.

Push status / test push need a separate lambda contract; until then the push column shows `—` and the "Send test" button is disabled.

## Frontend behavior summary (lambda mode)

| Control | Behavior |
| --- | --- |
| Grant role select + Grant button | Disabled, tooltip `User management write endpoint pending.` |
| Revoke role badge "×" | Disabled |
| Change email pencil | Disabled |
| Reset password | Disabled |
| Send test push | Disabled |
| Push status badge | Renders `—` (no `admin_list_push_status` RPC fired) |

Supabase mode (`DATA_BACKEND === "supabase"`) keeps the original behavior unchanged.