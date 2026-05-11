## Diagnosis

`/app/users` runs in `DATA_BACKEND === "lambda"` (default in `src/lib/runtimeConfig.ts`). The list comes from `GET /users` correctly, but every mutation still calls Supabase directly:

- Grant role → `supabase.from("user_roles").insert(...)` ← raises **"new row violates row-level security policy for table user_roles"** because there is no Supabase session in lambda mode, so `auth.uid()` is null and the admin RLS check fails.
- Revoke role → `supabase.from("user_roles").delete()`
- Reset password → `supabase.rpc("admin_reset_password")` + `supabase.auth.resetPasswordForEmail`
- Change email → `adminChangeUserEmail` (Supabase admin server fn)
- Send test push → `sendTestPushToUser` (Supabase admin server fn)
- Push status badge → `supabase.rpc("admin_list_push_status")`

Per the new rules, **no Supabase write or admin call may run in lambda mode**, and the lambda write endpoints (`POST /users`, `PATCH /users/:id`, `PATCH /users/:id/role`, `PATCH /users/:id/status`, `PATCH /users/:id/password-reset`, `PATCH /users/:id/disable`) are treated as not-yet-available even though the adapter stubs in `src/lib/api/users.ts` exist. Until the backend confirms them, all writes are gated as BackendPending.

## Plan

### 1. `src/routes/app.users.tsx` — gate every write in lambda mode

- Compute `const isLambda = DATA_BACKEND === "lambda";` once at the top of `UsersPage`.
- Keep the existing list/query exactly as-is (lambda branch already correct). Add `retry: false` so a 401 from `GET /users` surfaces instead of looping.
- For every action below, in lambda mode:
  - Render the existing button/control **disabled** (no layout change, design preserved).
  - Wrap with `<Tooltip>` showing **"User management write endpoint pending."**
  - Do NOT execute the underlying Supabase call. The mutations themselves should early-return + toast the same message if invoked.
- Affected controls:
  - `<GrantRole>` Add button and `<Badge>` "×" revoke button → disabled in lambda mode.
  - "Change email" pencil button → disabled.
  - "Reset password" button → disabled.
  - "Send test" push button → disabled.
  - Push column badge → render neutral "—" in lambda mode (no `admin_list_push_status` call).
- Status / Last login columns continue to read from the lambda payload — no change.
- In Supabase mode (`DATA_BACKEND === "supabase"`) every existing flow keeps working unchanged.

### 2. Skip Supabase admin calls in lambda mode

- Guard the Supabase parallel reads (`profiles`, `user_roles`, `listEmails`, `admin_list_push_status`) so they only run in the supabase branch (already true; add the same guard for the push RPC).
- Remove the lambda-mode invocations of `adminListUserEmails` / `adminChangeUserEmail` / `sendTestPushToUser` (only call the server fns inside the Supabase branch / handlers).

### 3. `<RoleGate>` consideration

`RoleGate allow={["admin"]}` reads roles from the auth context. In lambda mode roles come from the lambda `/auth/me` payload, so this gate already works — no change needed. Verify no Supabase fallback fires inside the gate.

### 4. New audit doc — `docs/USERS_ROLES_LAMBDA_CUTOVER.md`

Sections:
- **Read path** — `GET /users` confirmed; list page is read-only in lambda mode.
- **Incident** — `supabase.from("user_roles").insert(...)` triggered RLS violation because lambda users have no Supabase session.
- **Decision** — disable every Supabase user/role/profile/auth admin write in lambda mode. Frontend never bypasses RLS.
- **Pending backend endpoints** (required before re-enabling UI):
  - `POST /users`
  - `PATCH /users/:id`
  - `PATCH /users/:id/role`
  - `PATCH /users/:id/status`
  - `PATCH /users/:id/password-reset`
  - `PATCH /users/:id/disable` (or `DELETE /users/:id`)
- **Rules** — role/status changes must be backend-owned and audit-logged server-side; the frontend only triggers the call.

### Out of scope

- No backend or migration changes; no RLS policy edits.
- No design/layout changes; controls remain in the same positions, only disabled in lambda mode.
- No mock data, no Supabase fallback in lambda mode, no frontend-computed FX.
- The "Add consumer account" link to `/app/users/new-consumer` stays visible; that route gets the same "BackendPending" treatment in a follow-up if it currently writes via Supabase (out of scope here unless it's the source of another error).

### Acceptance

- Loading `/app/users` lists real users from `GET /users` with no errors.
- In lambda mode, clicking any role-grant, role-revoke, change-email, reset-password, or send-test control does nothing destructive: button is disabled with the "User management write endpoint pending." tooltip; no Supabase request is made; no RLS error appears in the console or as a toast.
- Push column shows "—" in lambda mode (no `admin_list_push_status` call observed in network tab).
- Switching to `DATA_BACKEND === "supabase"` restores the original full functionality unchanged.
- `docs/USERS_ROLES_LAMBDA_CUTOVER.md` exists and documents the cutover and pending endpoints.
