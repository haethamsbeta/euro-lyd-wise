# Cross-Device Visual QA & Optimization Pass

A pure visual/layout audit of the app across desktop, tablet, and phone viewports. No backend, no functionality changes — only responsive polish where issues are found.

## Scope

Audit every primary surface at three breakpoints and fix only what's visibly broken or off (overflow, cramped spacing, illegible text, broken grids, RTL issues, dock collisions, modal sizing). Designs stay as they are.

## Devices to test

- Desktop: 1440×900 and 1920×1080
- Tablet: 820×1180 (portrait) and 1024×768 (landscape)
- Phone: 390×844 (iPhone) and 360×800 (Android)

Each in both LTR (English) and RTL (Arabic), light + dark.

## Pages to audit

Authenticated app shell:
1. `/app` — Dashboard (KPIs, currency strip, charts)
2. `/app/transactions/new` — Wizard, all 5 steps
3. `/app/transactions` — List + filters
4. `/app/transactions/$id` — Detail
5. `/app/holders` + `/app/holders/$id` + `/app/holders/new`
6. `/app/accounts` + `/app/accounts/$id` (ledger view — pay attention)
7. `/app/vaults` + `/app/vaults/$id`
8. `/app/groups` + `/app/groups/$id` (newly redesigned)
9. `/app/approvals`
10. `/app/me/activity`
11. `/app/audit`
12. `/app/reports`
13. `/app/users`, `/app/portal-accounts`
14. `/app/admin/fx-rates`, `/app/admin/branches`
15. `/app/settings/notifications`, `/app/settings/security`, `/app/about`

Public / portal:
16. `/login`, `/forgot-password`, `/reset-password`, `/change-password`
17. `/portal` and `/portal/$accountId/$currency`
18. `/m` mobile shell routes (`/m/login`, `/m/dashboard`)

## What to check on each page

- **Header toolbar**: hamburger + logo + search + actions don't wrap or clip; search collapses correctly on phone.
- **Bottom dock**: doesn't cover content (main `pb-*` is sufficient); raised center action sits correctly; hidden on `/app/transactions/new`.
- **Tables**: horizontal scroll on phone instead of squished columns; sticky headers behave; ledger rows in `/app/accounts/$id` stay readable.
- **Cards & grids**: 1 col phone / 2 col tablet / 3–4 col desktop; no orphaned cards; equal heights.
- **Wizard steps**: stepper visible on phone; sticky next/back buttons don't overlap dock; numeric keypad inputs on amounts.
- **Modals/sheets/dialogs**: full-height on phone, centered on desktop; close button reachable; long forms scrollable.
- **Typography**: serif headings don't break awkwardly; line-height comfortable; no truncation hiding key data.
- **RTL**: icons mirrored where appropriate; padding/margin flipped; numbers stay LTR; toolbar still LTR-locked.
- **Theme**: gold tokens contrast properly in dark; borders visible; no white-on-white in light.
- **Touch targets**: ≥44px on phone for all interactive elements.

## Process

1. Use `browser--navigate_to_sandbox` + `browser--set_viewport_size` to walk each page at each breakpoint.
2. Screenshot issues only (not every page).
3. Compile a findings list grouped by severity:
   - **P1** — broken/unusable (overflow, hidden content, dock collision)
   - **P2** — cramped/ugly but functional
   - **P3** — minor polish
4. Fix P1s and P2s with minimal Tailwind/CSS-token changes (no design changes, no logic). P3s reported but only fixed if cheap.
5. Re-screenshot fixed pages to confirm.

## Out of scope

- Any backend/API/data wiring
- New features, new copy beyond fixing truncation
- Visual redesigns of components
- Translation content (already covered in prior turns)

## Deliverable

A short report listing what was checked, what was found per device, and what was fixed — plus screenshots of before/after for any P1/P2 fixes.
