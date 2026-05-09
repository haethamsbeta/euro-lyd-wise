## Goal

Give admins a quick way to preview the staff app as a different role (Admin, Teller, Auditor, Consumer) without changing anything in the database. The switch is a local view-only override — the user is still admin, RLS is unaffected, and reverting is one click.

## UX

A new compact dropdown lives in the top toolbar (next to the notification bell / account menu) on `/app/*` routes, visible **only to admins**.

- Trigger: a small pill showing `Eye` icon + current view label (e.g. `Admin view`). When previewing a non-admin role, the pill turns gold/highlighted with a tiny `(preview)` tag so it's never mistaken for the real role.
- Menu items: Admin, Teller, Auditor, Consumer — each with its icon and a one-line hint ("full access", "transactions only", "read-only", "customer portal").
- Picking **Consumer** closes the menu and navigates to `/portal` (consumer experience lives there). Picking any staff role stays in `/app` and re-renders nav, dock, and dashboards.
- A persistent banner appears at the top of `/app` while previewing a non-admin role: `Previewing as Teller — Exit preview`. One click restores the Admin view.

## How the override works

A new `RoleViewProvider` wraps the app shell and exposes `effectiveRoles` + `setViewAs(role | null)`.
- `effectiveRoles` defaults to the real `roles` from `useAuth`.
- When admin sets a preview role, `effectiveRoles` returns `[previewRole]` instead.
- Persisted in `localStorage` (`dahab.viewAs`) so a refresh keeps the preview, but it's automatically cleared if the real user is no longer admin.
- All UI gating (`AppShell` NAV filter, `BottomDock` `pickRole`, `RoleGate`, dashboard role split in `app.index.tsx`, holders/$id teller hiding, etc.) reads `effectiveRoles` instead of `roles` directly.
- Data calls (Supabase queries, server functions) keep using the real session — RLS still allows the admin to see everything; we're only hiding affordances. This is explicitly a dev/QA tool, not a security boundary.

## Files to add / change

1. **New `src/lib/role-view.tsx`** — `RoleViewProvider`, `useRoleView()`, and a thin `useEffectiveRoles()` helper. Persists to `localStorage`. Exposes `isPreviewing`, `viewAs`, `setViewAs`.
2. **`src/lib/auth.tsx`** — no behavior change, but export a small `useEffectiveRoles()` re-export so existing callers can migrate with a one-line swap (`useAuth().roles` → `useEffectiveRoles()`).
3. **`src/routes/app.tsx`** — wrap the `<AppShell />` with `<RoleViewProvider>`.
4. **`src/components/app/app-shell.tsx`**:
   - Replace internal use of `roles` (for NAV filtering and the `isStaff` gate) with `effectiveRoles`. The real `roles` is still used to decide who can see/use the switcher.
   - Add a new `<RoleViewSwitcher />` in the right action cluster (admin-only).
   - Add the preview banner above `<Outlet />` when previewing.
   - `RoleGate` reads `effectiveRoles`.
5. **New `src/components/app/role-view-switcher.tsx`** — the dropdown UI (uses existing `DropdownMenu`).
6. **`src/components/app/bottom-dock.tsx`** — `pickRole` reads `effectiveRoles`.
7. **`src/routes/app.index.tsx`** — dashboard role split (`isAdmin/isAuditor/isTeller`) reads `effectiveRoles`.
8. **`src/routes/app.holders.$id.tsx`** — `isTeller` flag reads `effectiveRoles` so teller-balance hiding triggers in preview.
9. **Consumer redirect** — selecting "Consumer" calls `setViewAs("consumer")` and `navigate({ to: "/portal" })`. The portal route stays unchanged; the preview state is just remembered so returning to `/app` still shows the banner.

## Out of scope

- No DB or RLS changes.
- No real role assignment (admins still manage real roles on the existing `/app/users` page).
- Server functions and audit logs continue to record the real admin user — the preview is purely client-side presentation.