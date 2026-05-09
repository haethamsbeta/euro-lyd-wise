## Goal

Tighten the mobile and tablet experience of `/app/*` so the bottom dock and top toolbar feel balanced and finger-friendly. The web (≥`lg`) layout stays exactly as-is. The center "+" FAB stays the largest, most prominent element on the dock.

## Scope

Files touched:
- `src/components/app/bottom-dock.tsx` — dock sizing, spacing, FAB, safe-area
- `src/components/app/app-shell.tsx` — top toolbar density on phone/tablet, main `pb` to match new dock height
- `src/components/app/global-search.tsx` — collapse to an icon-trigger on phone, expand inline from tablet up

No changes to routes, business logic, role view, or any `lg:` styles already in use.

## Bottom dock adjustments (phone + tablet)

Currently the bar is `h-16`, `mx-4 mb-3`, items use `text-[10px]` labels and `w-5 h-5` icons. On a 390px iPhone this feels cramped, the FAB barely clears the bar, and labels are hard to read.

Changes (all gated to `<lg`, desktop classes unchanged):
- Increase bar height: `h-16` → `h-[68px]` on `<sm`, `sm:h-[64px]`, `lg:h-16` (current).
- Outer margins: `mx-3 mb-2` on `<sm`, current `mx-4 mb-3` from `sm` up. Add `pb-[max(env(safe-area-inset-bottom),0.25rem)]` wrapper so iPhone home-indicator never overlaps.
- Item padding: `px-2 py-1` on `<sm`, `sm:px-3 sm:py-1.5`. Make each `<DockItem>` `min-w-[56px] min-h-[44px]` for proper touch target.
- Icons: `w-[22px] h-[22px]` on `<sm`, `sm:w-5 sm:h-5`. Stroke unchanged.
- Labels: `text-[11px]` on `<sm`, `sm:text-[10px]`; allow `truncate max-w-[64px]`.
- Active dot stays, but re-anchor to `-top-1.5` on `<sm` so it doesn't clip under the rounded edge.

## FAB (must stay big and obvious)

- Size up on phone/tablet: `w-16 h-16` on `<sm`, `sm:w-15 sm:h-15` (15 = 60px via arbitrary), `lg:w-14 lg:h-14` (current).
- Lift more so it visually breaks the bar on the taller mobile dock: `-mt-9` on `<sm`, `sm:-mt-8`, `lg:-mt-7`.
- Keep gradient, ring, ping animation, and `Plus` icon (size up to `w-8 h-8` on `<sm`).
- Keep horizontal margin so left/right item clusters don't crowd it: `mx-3` on `<sm`.

## Top toolbar adjustments (phone + tablet)

Currently the header is `h-16` on phone with `MoreButton + DahabCoin + GlobalSearch + NotificationBell + RoleViewSwitcher + AccountMenu`. On 390px the search swallows the row and the right-side icons get cramped.

Changes:
- Header height stays `h-16` on phone but reduce horizontal padding to `px-2.5` (`sm:px-5` already there).
- Reduce inter-element gap on phone: `gap-1` (`sm:gap-3` already there).
- Hide the brand wordmark on `<md` (already hidden), keep just the coin.
- `GlobalSearch`: render as an icon-only "search" button on `<md` that toggles a full-width overlay search bar pinned just under the header. From `md` up keep current inline search exactly as it is now. This frees ~180px on phone for the right cluster.
- Right cluster on phone: shrink each control to `h-9 w-9` via wrapper if needed; current sizes are fine but ensure `gap-1` so all four (search-trigger, bell, role-switcher, account) fit without overflow on 360–390px widths.

## Main content padding

`<main>` currently uses `pb-28 md:pb-24`. With the slightly taller mobile dock + safe-area, bump to `pb-32 sm:pb-28 md:pb-24 lg:pb-24`. Desktop unchanged.

## Out of scope / explicitly preserved

- All `lg:` and `md:` (where `md` already matches desktop) classes are kept verbatim.
- No changes to `DOCK_CONFIG`, role logic, routing, queries, or any business logic.
- `/m/*` mobile-app routes and `/portal` are not touched.
- No design-token changes; uses existing `gold/*` and `card/*` tokens.

## Verification

After edits, take phone (390×844) and tablet (820×1180) screenshots of `/app` to confirm:
- FAB visibly larger than dock items and clearly clears the bar
- Dock labels legible, no clipping, safe-area respected
- Top toolbar fits all controls without overflow on 360px width
- Desktop (≥1024px) screenshot is pixel-identical to before
