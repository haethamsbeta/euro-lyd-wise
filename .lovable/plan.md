## Goal

Add a complete password reset system that follows the existing DB/RLS conventions, AND structure the new code so the backend can later be swapped from Lovable Cloud (Supabase) to an AWS Lambda REST API with minimal changes.

Two paths to reset a password:
1. Self-serve "Forgot password?" link on the DAHAB Family login page → email link.
2. Admin-triggered reset from the Users page → revokes sessions + emails the staff member a reset link.

Either path forces the user to set a new password before re-entering the app (`must_change_password = true`).

Consumer Portal stays password-less (token/OTP-ready) — unchanged.

---

## 1. Database migration (Supabase, current backend)

```sql
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
```

New SECURITY DEFINER RPCs (`set search_path = public`, mirror existing `has_role` style):

- `admin_reset_password(p_target_user uuid) returns jsonb`
  - Guard: `has_role(auth.uid(),'admin')` else raise.
  - Refuse for users with only `consumer` role.
  - Sets `profiles.must_change_password = true` for the target.
  - Inserts `audit_log` row: `action='password.admin_reset', target=<target uuid>`.
  - Returns `{ ok: true, email: <auth.users.email> }`.

- `clear_must_change_password() returns void`
  - Sets the flag false for `auth.uid()`.
  - Audit log: `action='password.changed'`.

No RLS changes required.

---

## 2. Backend abstraction layer (prepare for AWS Lambda swap)

To avoid scattering Supabase calls across the new code, introduce a thin auth-service interface used by every new password-related screen:

`src/lib/authService.ts` — interface + Supabase implementation:
```
export interface AuthService {
  signIn(email, password): Promise<{ user, mustChangePassword }>;
  sendPasswordResetEmail(email): Promise<void>;
  updateOwnPassword(newPassword): Promise<void>;
  clearMustChangePassword(): Promise<void>;
  adminResetPassword(targetUserId): Promise<void>;   // server-side only
  signOut(): Promise<void>;
}
```

- `src/lib/authService.supabase.ts` — current implementation, calls Supabase + the new RPCs.
- `src/lib/authService.lambda.ts` — STUB that throws "Not implemented yet" with TODO comments for each REST endpoint shape (e.g. `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /admin/users/:id/reset-password`). This is the template the AWS Lambda team will fill in.
- `src/lib/authService.ts` exports `authService` selected by `import.meta.env.VITE_AUTH_BACKEND` (`"supabase"` default, `"lambda"` future).

All new UI components/server functions consume `authService` — never `supabase.auth.*` directly. Existing screens are not refactored in this pass; only the new password flow uses the abstraction so the swap is incremental.

Also add a section to `docs/ARCHITECTURE.md`:
- "Backend swap plan (AWS Lambda)" — lists the REST endpoint contract the Lambda backend must implement to satisfy `AuthService`, and notes that `must_change_password` is part of the user profile/JWT claims.

---

## 3. Server function (admin-triggered reset)

`src/server/auth.functions.ts` (new) — uses `requireSupabaseAuth` middleware:
- `adminResetPassword({ userId })`:
  1. Calls RPC `admin_reset_password` via the user's authed client (RLS + RPC enforces admin).
  2. `supabaseAdmin.auth.admin.signOut(userId, 'global')` — invalidates all refresh tokens.
  3. `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: '<origin>/reset-password' } })` — Supabase emails the recovery link automatically.
  4. Returns `{ ok: true }`.

When the backend later moves to Lambda, this server function becomes a thin proxy to `POST /admin/users/:id/reset-password` (or is replaced entirely by `authService.lambda`).

---

## 4. New public routes

- `src/routes/forgot-password.tsx`
  - Email input → `authService.sendPasswordResetEmail(email)`.
  - Always shows the same generic confirmation (no enumeration).

- `src/routes/reset-password.tsx`
  - Listens to Supabase `PASSWORD_RECOVERY` event (recovery link lands here with a recovery session).
  - New password + confirm → `authService.updateOwnPassword(pw)` → `authService.clearMustChangePassword()` → `authService.signOut()` → redirect `/login?portal=staff`.

- `src/routes/change-password.tsx` (used after forced-change login)
  - Requires active session.
  - Same form. Same calls. Redirect to `/app` on success.

---

## 5. Login flow update

`src/routes/login.tsx`:
- Add small "Forgot password?" link under the password input (staff portal only) → `/forgot-password`.
- After successful sign-in, read `profiles.must_change_password`. If true, redirect to `/change-password` instead of `/app` / `/portal`.

---

## 6. Admin reset UI

`src/routes/app.users.tsx`:
- Add a "Reset password" button per staff user (admins only; hidden for self and for `consumer`-only users).
- Confirm dialog → calls the `adminResetPassword` server function.
- Toast: "Reset link sent. The user must set a new password before signing in."

---

## 7. Files

- DB migration: `must_change_password` column + 2 RPCs.
- New: `src/lib/authService.ts`, `src/lib/authService.supabase.ts`, `src/lib/authService.lambda.ts`
- New: `src/server/auth.functions.ts`
- New: `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx`, `src/routes/change-password.tsx`
- Edited: `src/routes/login.tsx`, `src/routes/app.users.tsx`
- Edited: `docs/ARCHITECTURE.md` (Lambda backend swap section + AuthService contract)

---

## Out of scope

- Actually wiring AWS Lambda (we only ship the stub + documented contract).
- Consumer Portal password flow (stays token/OTP-ready).
- Broader perf pass.

Approve to implement.