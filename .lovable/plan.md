## Goal
Make the floating toolbar truly fill its width: bigger, more breathing room between icons, embed the Dahab logo inside the toolbar (far left, next to More), and ensure every icon shows its page name as a hover tooltip (no visible label text in the bar).

## Changes — single file: `src/components/app/app-shell.tsx`

### 1. Embed the brand inside the toolbar
- Add a new left-most cell in the toolbar grid containing the Dahab coin + wordmark (re-use `<DahabCoin />` and `<DahabMark size="sm" showArabic={false} />`).
- Wrap it in a `<Link to="/app">` with `aria-label="Dahab"` so it doubles as a Home shortcut.
- Remove the separate `fixed top-3 left-3` brand block (it currently floats outside the bar). The logo lives only inside the toolbar now.
- Drop `lg:pl-24` from `<main>` since there's no fixed brand to clear anymore.

### 2. New 4-column grid that uses the full width
Replace the current `grid-cols-[auto_1fr_auto]` with:
```
grid grid-cols-[auto_auto_1fr_auto] items-center gap-4 sm:gap-6
```
Cells:
1. Brand (logo + wordmark)
2. More button
3. Primary nav (centered, `justify-self-center`, `gap-5 sm:gap-7`)
4. NotificationBell (`justify-self-end`)

Bump the pill to `max-w-6xl`, padding to `px-5 py-3 sm:px-8`, so the row spans almost the full viewport at desktop and the icons are evenly distributed instead of clustering.

### 3. Bigger, more breathing tiles
- Primary tiles + More tile: `h-14 w-14` (was `h-12 w-12`).
- Inner icon chip: `h-11 w-11 rounded-2xl` (was `h-9 w-9`).
- Icon glyph: `h-6 w-6` with `strokeWidth={1.5}` (was `h-5 w-5`).
- Raised `+`: `h-16 w-16` with `h-8 w-8` icon, `-mt-4` lift, keep `ring-4 ring-card shadow-gold` halo.
- Inter-tile gap inside the nav: `gap-5 sm:gap-7` so the four primary tiles + raised `+` spread across the middle column instead of bunching.

### 4. Hover tooltips on every icon
- Already-present `Tile` tooltip stays.
- Add the same `Tooltip` wrapper around: the brand link ("Dahab — Home"), the raised `+` (already wrapped — keep), the More button (already wrapped — keep), and the `NotificationBell` trigger by wrapping its render with `Tooltip`/`TooltipTrigger asChild`/`TooltipContent` showing `t("nav.notifications")`.
- Tooltip side stays `bottom`, `delayDuration={150}` on the existing `TooltipProvider`.
- No visible text labels in the bar — labels only render inside tooltips and inside the More sheet.

### 5. Token cohesion (unchanged direction, just applied to new sizes)
- Pill: `bg-card/85 backdrop-blur-xl border border-gold/25 shadow-[var(--shadow-gold)]`.
- Inactive chip: `bg-gold/5 ring-1 ring-inset ring-gold/15`, hover `ring-gold/35` + soft gold drop-shadow.
- Active chip: `bg-gradient-gold text-primary-foreground ring-1 ring-gold/40 shadow-gold`.
- More: `bg-gold/10 ring-1 ring-gold/30 hover:bg-gold/20`.
- Brand link: subtle `hover:bg-gold/5 rounded-2xl px-2 py-1` so it feels like a tile member without competing with active states.

## Out of scope
Routes, i18n keys, sheet contents, account menu internals, notification bell internals — unchanged.
