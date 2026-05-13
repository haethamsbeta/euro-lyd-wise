## Goal

Polish the phone experience (≈320–430px) of the existing DAHAB web app without changing desktop/tablet visuals, functionality, routes, copy, or business logic.

## Approach

All work is **CSS / responsive className changes only**. No component logic, no route changes, no data changes. Edits are gated to phone widths using Tailwind's `max-sm:` (≤639px) and, where needed, `max-[400px]:` for very small phones. Default and `sm:`/`md:`/`lg:` styles stay untouched, so desktop and tablet renderings are byte-identical.

## Scope of files

1. **`src/styles.css`** — add a small mobile-only block at the end (inside a `@media (max-width: 640px)` query) covering:
   - Base font smoothing & `font-size: 15px` on `html` for comfortable reading; `line-height` bump on body copy.
   - Prevent horizontal scroll: `html, body { overflow-x: hidden; }` and `img, svg, video { max-width: 100%; height: auto; }`.
   - Form controls: minimum `font-size: 16px` on `input, select, textarea` to stop iOS zoom-on-focus.
   - Tap target floor: `button, [role="button"], a.btn, .tap` get `min-height: 44px`.
   - Card / section spacing: `.card-futur` reduced inner padding (`p-4` equivalent), section vertical rhythm tightened.
   - Dialog/Sheet: full-width with safe-area insets (`padding-inline: max(env(safe-area-inset-left), 12px)` etc.), bottom sheets respect `env(safe-area-inset-bottom)`.
   - Tables: enable horizontal scroll wrapper (`.table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }`) for any tables already wrapped; add a fallback rule to make raw `<table>` scrollable inside `.card-futur`.
   - Bottom dock: respect safe-area inset bottom; add `padding-bottom: env(safe-area-inset-bottom)` and bump z-index spacing on main content (`main { padding-bottom: calc(72px + env(safe-area-inset-bottom)); }` only on mobile when dock is visible).

2. **`src/components/app/app-shell.tsx`** — adjust only responsive classes:
   - Top bar: tighter horizontal padding on mobile (`px-3 sm:px-6`), reduce gap, hide non-essential desktop chrome already conditional.
   - Mobile sheet/menu trigger: ensure `h-11 w-11` tap size on phones.
   - Main content wrapper: `px-3 sm:px-6 py-4 sm:py-8` to remove cramped feel.

3. **`src/components/app/bottom-dock.tsx`** — verify and add `pb-[env(safe-area-inset-bottom)]`, `min-h-[56px]` items, slightly larger icons on phones; raised center button keeps existing visual.

4. **`src/components/app/section-header.tsx`** — stack title/actions vertically on `max-sm:` (`flex-col items-start gap-3 sm:flex-row sm:items-center`), reduce title size to `text-xl sm:text-2xl`.

5. **`src/components/app/kpi-card.tsx`** + **`currency-totals-strip.tsx`** — switch to single-column / horizontal-scroll on mobile (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, or `flex overflow-x-auto snap-x` strip), keep desktop grid identical.

6. **Tables on data-heavy pages** (`app.transactions.index.tsx`, `app.holders.index.tsx`, `app.accounts.index.tsx`, `app.vaults.index.tsx`, `app.audit.tsx`, `app.approvals.tsx`, `app.users.tsx`) — wrap the existing `<Table>` in a `<div className="table-wrap -mx-3 sm:mx-0 px-3 sm:px-0">` to enable horizontal scroll without altering columns. No column hiding, no row template changes.

7. **Dialogs** (`src/components/ui/dialog.tsx`, `sheet.tsx`, `drawer.tsx`) — add `max-sm:w-[calc(100vw-1rem)] max-sm:rounded-xl max-sm:p-4` to content; preserve desktop sizing.

8. **Forms / wizard** (`new-transaction-wizard.tsx`, `holders.new.tsx`, login pages) — only className tweaks: `grid-cols-1 sm:grid-cols-2`, larger input height on phones (`max-sm:h-11`), full-width primary CTAs on mobile (`w-full sm:w-auto`).

9. **Global search & notification bell triggers** — `h-11 w-11` on phones for comfortable tap.

## Out of scope (not touched)

- Mobile customer app under `/m/*` and `src/components/mobile/*` (already a dedicated phone UI).
- Any desktop-only or `sm:`+ classes (only adding/adjusting `max-sm:` / mobile-first base where currently cramped).
- Backend, auth, routing, copy, i18n strings, icons, color tokens.
- The `/app/admin/sandbox-multi-entry`, `/app/admin/test-sandbox`, and other sandbox pages logic — only the same generic table/dialog/section-header wrapper polish applies.

## Verification

After edits, open the preview at 375×812 and 414×896 and confirm on:
- `/app` dashboard, `/app/transactions`, `/app/holders`, `/app/accounts`, `/app/vaults`, `/app/approvals`, `/app/users`, login.

Checks:
1. No horizontal page scroll (tables scroll inside their wrapper instead).
2. All buttons/icons ≥44px tap targets.
3. Inputs do not trigger iOS zoom (≥16px font).
4. Section headers, KPI cards, and dialogs fit screen with comfortable padding.
5. Resize back to 1280px+ — desktop is visually unchanged (spot check dashboard + transactions list).
