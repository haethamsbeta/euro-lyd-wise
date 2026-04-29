## Goal
On the mobile top bar in the staff app shell, the horizontal nav currently lists every page the user can access (Dashboard, New transaction, Transactions, Accounts, Vaults, Approvals, My activity, Audit log, Users & roles, Notifications). On a 714px viewport this scrolls horizontally and feels noisy. We'll keep only the first three role-visible items as pill links, and group the remaining items into a single "More" dropdown menu — making the primary actions immediately clear while keeping all options accessible.

## Scope
- File: `src/components/app/app-shell.tsx` (mobile top bar block only — desktop sidebar stays unchanged)
- No route, role, or behavior changes; purely a presentational regrouping.

## Changes

1. In the mobile nav block (lines ~149-168), split `visibleNav` into:
   - `primaryNav = visibleNav.slice(0, 3)` → rendered as the existing pill links
   - `moreNav = visibleNav.slice(3)` → rendered inside a dropdown trigger labeled **More** (with a `ChevronDown` icon)

2. Use the existing `DropdownMenu` primitives from `@/components/ui/dropdown-menu`:
   - Trigger: a pill matching the current pill style. If any item in `moreNav` is the active route, the "More" trigger gets the active gold styling so the user still sees they're on a sub-page.
   - Content: each `moreNav` entry as a `DropdownMenuItem` rendering a `<Link>` with its icon + label, with the active item highlighted in gold.

3. Imports to add at the top of `app-shell.tsx`:
   - `ChevronDown` from `lucide-react`
   - `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem` from `@/components/ui/dropdown-menu`

4. Desktop sidebar (`<aside>`) is untouched — full vertical list remains there.

## Visual result (mobile)

```
[Dashboard] [New transaction] [Transactions]   [More ▾]
                                                 ├─ Accounts
                                                 ├─ Vaults
                                                 ├─ Approvals
                                                 ├─ My activity
                                                 ├─ Audit log
                                                 ├─ Users & roles
                                                 └─ Notifications
```

## Notes
- Order follows the existing `NAV` array, which already places the most important actions first, so "first three" gives Dashboard / New transaction / Transactions for admins and tellers, and Dashboard / Transactions / Accounts for auditors (since auditors don't see "New transaction"). That matches each role's primary workflow.
- No new dependencies; `dropdown-menu.tsx` is already in `src/components/ui/`.
