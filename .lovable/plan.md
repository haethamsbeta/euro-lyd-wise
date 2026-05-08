## Goal
Polish the floating toolbar so it (a) uses the full bar width with even spacing, (b) has uniformly sized icon tiles (only the raised `+` is bigger), and (c) aligns visually with the rest of the app's gold-on-graphite design system instead of using ad-hoc `oklch(...)` literals.

## Changes — single file: `src/components/app/app-shell.tsx`

### 1. Use the full bar width
- Bump pill from `max-w-3xl` → `max-w-5xl` so icons can breathe and reach both ends.
- Replace `justify-between` + center `<nav>` with a 3-column grid:
  ```
  grid grid-cols-[auto_1fr_auto] items-center gap-3
  ```
  Left cell = More button, middle cell = primary nav (centered with `justify-center`), right cell = NotificationBell. The `1fr` middle column fills all remaining space so the row never looks crammed.
- Increase inner `gap` between primary tiles to `gap-3 sm:gap-4` (was `gap-1 sm:gap-2`).

### 2. Symmetric tile sizing
- All primary tiles (Dashboard, Transactions, Holders, Approvals/Vaults) and the More tile become a single shared size: `h-12 w-12` everywhere (no sm: bump). Inner icon chip `h-9 w-9`, icon `h-5 w-5`.
- Raised `+`: `h-14 w-14` with `h-7 w-7` icon — only element intentionally larger, lifted `-mt-3` (less aggressive than current `-mt-4` so it sits cleanly inside the new spacing).
- Remove the More button's enlarged frame so it matches the others (still distinguishable by gold-tinted background and ring).

### 3. Design-token cohesion
Replace ad-hoc `oklch(0.82_0.14_85/...)` and `oklch(0.18_0.03_60/...)` arbitrary classes with semantic tokens already in `src/styles.css`:
- Pill bg: `bg-card/85 backdrop-blur-xl` with `border-gold/25` and `shadow-[var(--shadow-gold)]` (token from styles.css). Gradient overlay → drop, use flat `bg-card/85` for cohesion with cards elsewhere (`card-luxe`).
- Inactive tile chip: `bg-gold/5 ring-1 ring-inset ring-gold/15`, hover `ring-gold/35` and `hover:bg-gold/10`.
- Active tile: `bg-gradient-gold text-primary-foreground ring-1 ring-gold/40 shadow-gold`.
- More button base: `bg-gold/10 ring-1 ring-gold/30 hover:bg-gold/20`.
- Raised `+`: `bg-gradient-gold text-primary-foreground ring-4 ring-card shadow-gold`, glow halo `before:bg-gold/20`.
- Icons keep `strokeWidth={1.5}` for the existing futuristic line weight.

### 4. Layout polish
- Toolbar header padding: `px-4 sm:px-8 pt-3 sm:pt-4` so the pill aligns with main page gutters.
- Pill inner padding: `px-4 py-2.5 sm:px-6` for symmetric breathing room around the 3 columns.
- `<main>` keeps `lg:pl-24` to clear the fixed Dahab brand.

### 5. Cleanup
- Remove `bg-gradient-to-b from-...to-...` on the pill (replaced by flat `bg-card/85`).
- Remove the `flex flex-1` center nav wrapper (now grid-driven).
- No prop, route, or i18n changes.

## Out of scope
Sheet contents, account menu, notification bell, brand mark, routes — unchanged.
