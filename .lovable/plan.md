## Goal

1. Remove the accountMenu (login/avatar) from the right side of the toolbar and surface it inside the More panel instead.
2. Make every toolbar tile **icon-only** — no visible text labels in the bar. Each icon gets a `Tooltip` (and `aria-label`) describing its purpose.
3. Replace the More dropdown with a slide-in **Sheet** (side panel) holding all overflow nav, language/theme toggles, and the account/sign-out section.
4. arrange the space and centralizatin of icons in the tool bar and overall polish up
5. make the dark mode is the defualt view unless user changhe it

## Changes (single file: `src/components/app/app-shell.tsx`)

### Toolbar layout

- Pill becomes: `[More icon button (left)] · [centered icon row: Dashboard, Transactions, raised +, Holders, Approvals] · [NotificationBell (right)]`.
- AccountMenu removed from the header entirely.

### Tile component (icon-only)

- Drop the `<span>` text label; keep the chip+icon visual.
- Tighten size: `h-12 w-12 sm:h-14 sm:w-14` (square, no label height).
- Wrap each `<Link>` in `<Tooltip><TooltipTrigger asChild>…</TooltipTrigger><TooltipContent side="bottom">{label}</TooltipContent></Tooltip>`.
- Add `aria-label={t(item.labelKey)}` for screen readers.
- Raised `+` button: also icon-only with tooltip "New Transaction"; remove the "New" caption underneath.

### More button → side Sheet

- Replace `DropdownMenu` with `Sheet` (`@/components/ui/sheet`).
- Trigger: same enlarged gold chip but icon-only (Menu icon, no "More" text), with tooltip "Menu".
- `<SheetContent side="left">` (mirrors to right in RTL via existing dir handling — but Sheet's `side` is fixed; use `side="left"` for LTR. Acceptable since user said "side of the page").
  - Width: `w-80 sm:w-96`.
  - Header: `SheetTitle` "Menu" + small subtitle.
  - Body sections (vertical stack, scrollable):
    1. **Navigation** — overflow nav items rendered as full-width buttons with icon + label, active state highlighted in gold.
    2. **Preferences** — `LanguageToggle` + `ThemeToggle` row.
    3. **Account** — moved AccountMenu content inline:
      - Avatar (initials) + email + role badges.
      - Sign-out button (reuses existing AlertDialog confirmation flow — extract a small `<SignOutButton />` from `account-menu.tsx`, OR import and render `<AccountMenu variant="full" />` directly inside the sheet).
- Close sheet on nav item click (`onOpenChange`).

### Tooltip provider

- `TooltipProvider` is already wrapping the app (check `__root.tsx`); if not, wrap the toolbar `<header>` in one. Will verify during implementation and add only if missing.

### Cleanup

- Remove `AccountMenu` and `MoreHorizontal`/`Menu`-related dropdown imports no longer used.
- Keep `NotificationBell` on the right side of the pill (single icon, already icon-only).

## Out of scope

- No nav items, routes, business logic, or translations changes (existing `nav.*` keys reused for tooltip text).
- No edits to `account-menu.tsx` unless extracting the sign-out section is cleaner — preferred approach: render `<AccountMenu variant="full" />` inside the sheet for zero duplication.