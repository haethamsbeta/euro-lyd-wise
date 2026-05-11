# Master Admin / Regular Admin Mode

Goal: gate all debug, backend-pending technical, and test UI behind a backend-provided `is_master_admin` flag. Regular admins get a clean production experience. Teller/auditor/consumer unchanged.

## 1. Auth user shape

- `src/lib/auth.tsx`:
  - Extend the `readLambdaUser()` parsed type and `applyLambdaAuthState()` so the in-memory session carries `is_master_admin?: boolean`.
  - Store it on the synthetic `Session.user` (e.g. `(user as any).is_master_admin`) and expose it via `useAuth()` as part of `user`.
- `src/routes/login.tsx` (line ~200): when persisting `dahab.user`, ensure the full user object from the Lambda response (including `is_master_admin`) is preserved verbatim — do not pick a subset.

## 2. Visibility helpers

New file `src/lib/admin-mode.ts` exporting:

- `useIsMasterAdmin()` — `roles` includes `admin` AND `user.is_master_admin === true`.
- `useIsRegularAdmin()` — `admin` AND not master.
- `useMasterPreview()` / `useSetMasterPreview()` — reads/writes `localStorage["dahab.masterPreviewAsRegular"]` (boolean). When true and the real user is master, helpers below behave as regular.
- `useShowMasterTools()` — `isMasterAdmin && !previewAsRegular`. Single hook used everywhere debug/test UI is conditionally rendered.

## 3. Role view toggle (`src/components/app/role-view-switcher.tsx` + `src/lib/role-view.tsx`)

- Show the existing role-view switcher only when `useShowMasterTools()` is true (currently shown to anyone with real `admin`).
- Add a second control next to it: "View as Regular Admin" toggle, visible only to real Master Admin. Toggling sets the master-preview flag from step 2. Show a thin banner (similar to the existing role-preview banner) while active: "Previewing as Regular Admin — master tools hidden." with an Exit button.

## 4. Dashboard (`src/routes/app.index.tsx`)

- Wrap the "Liquidity consolidated debug" block (~line 378) in `showMasterTools && (...)`.
- For each `<BackendPending ... />` instance (lines 465, 481, 794, 802, 857, 913, 1030): if `showMasterTools`, render existing `BackendPending`; otherwise render a clean `<ComingSoon />` placeholder (see step 7).

## 5. Reports (`src/routes/app.reports.tsx`)

- Wrap the dev console / "Business overview debug" block (~line 397) and the surrounding "Temporary preview debugging" section in `showMasterTools`.
- Replace user-facing `BackendPending` (lines 547, 666) with `ComingSoon` when not master.

## 6. Other admin screens

For Groups, Users, FX rates, Audit, Transactions, Approvals, Me/Activity:

- Search for `BackendPending`, dev-only debug `<pre>` / "debug" blocks, and any "Test …" buttons.
- Either gate the whole block behind `showMasterTools` (debug, test buttons, raw JSON) or swap `BackendPending` → `ComingSoon` for regular admins.
- No business-logic changes; visual gating only.

## 7. Coming soon component

New `src/components/app/coming-soon.tsx`: small card matching existing styles ("This section is coming soon."), accepts optional `title`. Used wherever `BackendPending` was shown to regular admins.

`BackendPending` itself is unchanged and remains used for the master view.

## 8. Constraints respected

- No backend changes; no Supabase fallback reintroduced.
- All debug code preserved, only visually gated.
- Teller/auditor/consumer paths untouched (the helpers return false for them).
- Role-view preview remains a frontend-only filter; backend permissions unaffected.

## 9. Verification

- TypeScript build (auto-run by harness).
- Manual: with `is_master_admin: true` user, dashboard shows debug + role switcher + "View as Regular Admin"; toggling hides them. With a fabricated user lacking the flag (regular admin), no debug, no `BackendPending` text, only `ComingSoon` placeholders.

## Files touched

- `src/lib/auth.tsx`
- `src/lib/admin-mode.ts` (new)
- `src/lib/role-view.tsx`
- `src/components/app/role-view-switcher.tsx`
- `src/components/app/coming-soon.tsx` (new)
- `src/routes/login.tsx` (preserve flag)
- `src/routes/app.index.tsx`
- `src/routes/app.reports.tsx`
- `src/routes/app.groups.index.tsx`, `app.groups.$id.tsx`
- `src/routes/app.users.tsx`, `app.admin.fx-rates.tsx`, `app.audit.tsx`
- `src/routes/app.transactions.index.tsx`, `app.approvals.tsx`, `app.me.activity.tsx`
