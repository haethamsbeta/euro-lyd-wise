## Goal

Restore reliable Master Admin detection driven entirely by the backend `is_master_admin` flag. No frontend hardcoding. UI gating already exists; we only fix the auth-state pipeline so the flag is typed, persisted, and trusted.

## Changes

### 1. `src/lib/api/auth.ts`
Extend `MeResponse` so the master flag and primary role are typed:
- add `is_master_admin?: boolean`
- add `role?: string`
(Keep existing `roles: string[]` and other fields.)

### 2. `src/lib/auth.tsx > refreshLambdaUser`
- Always pass the `/auth/me` payload through `normalizeLambdaUser` (already done).
- After normalization, branch:
  - If `fresh.is_master_admin === true` → skip the `/users?q=email` fallback entirely.
  - Else if `fresh.role === "admin"` and `is_master_admin !== true` → keep the existing `api.users.list({ q: email })` fallback to pick up the flag from the staff record, then re-normalize with that result.
- Write the merged normalized user (including `is_master_admin`) to `localStorage["dahab.user"]`, then call `applyLambdaAuthState()` so the in-memory session reflects the persisted value (matches current behavior).

### 3. Gating — leave untouched
- `useIsRealMasterAdmin` (reads `user.is_master_admin === true`).
- `useShowMasterTools` (`real && !previewAsRegular`).
- `setMasterPreviewAsRegular` storage + event.
- All existing call sites: Test Sandbox route, dashboard dev cards, holders/new dev section, vault dev tools, reports dev cards, `BackendPending`, role-view switcher.

### 4. Roles — confirmed mapping (no behavior change)
- `admin` → full business app privileges (regular admin).
- `admin` + `is_master_admin === true` → regular admin app + Master tools (sandbox, dev cards, backend-pending placeholders, role-view switcher).
- `teller` → unchanged.
- `auditor` → unchanged.
- `consumer` → unchanged; auth continues via Supabase branch in `AuthProvider`.

### 5. No new Master-only surfaces
Do not add gating to any new pages/components.

## Files touched

- `src/lib/api/auth.ts`
- `src/lib/auth.tsx`

No UI changes, no Supabase changes, no consumer flow changes.

## Acceptance

- Master account: Test Sandbox in nav, dev cards on dashboard / reports / vault / holders-new, `BackendPending` placeholders visible, "View as Regular Admin" toggle in role-view switcher.
- Toggling "View as Regular Admin" hides every Master-only surface; toggling back restores them — no logout required, no role change.
- Regular admin: full business app, none of the Master-only surfaces, no role-view switcher.
- Teller / auditor / consumer flows unchanged.
- Hard refresh keeps Master tools visible immediately because the flag is persisted in `localStorage["dahab.user"]`.
