## Goal
Refine the floating top toolbar:
1. Pin the Dahab logo to the top-left as a stationary brand mark (no scroll/sticky movement).
2. Move the "More" button to the far opposite side (left side in LTR / mirror-aware) and make it visibly bigger than the other tiles.
3. Refresh the icon look across the toolbar to feel more futuristic while keeping the same icons.

## Changes (single file: `src/components/app/app-shell.tsx`)

### 1. Stationary Dahab logo
- Remove the `<Link to="/app">` brand block from inside the floating pill.
- Add a new fixed brand element OUTSIDE the sticky header:
  ```
  <Link to="/app" className="fixed top-3 left-3 sm:top-4 sm:left-6 z-50 flex items-center gap-2">
    <DahabCoin />
    <span className="hidden lg:inline"><DahabMark size="sm" showArabic={false} /></span>
  </Link>
  ```
- Logo now stays in the corner; the toolbar pill remains centered without it.

### 2. Bigger "More" on the opposite side
- Move the More dropdown out of the centered `<nav>` and place it as the first child of the pill (left side in LTR), separated from the right-side notifications/account cluster which stays on the right.
- Resize the More tile: `h-14 w-20 sm:w-24`, larger icon (`h-6 w-6`), label text `text-[11px]`, with stronger gold ring/glow:
  ```
  rounded-2xl bg-[oklch(0.82_0.14_85/0.12)] ring-1 ring-[oklch(0.82_0.14_85/0.35)]
  hover:bg-[oklch(0.82_0.14_85/0.2)] shadow-[0_8px_20px_-10px_oklch(0.82_0.14_85/0.5)]
  ```
- Replace `MoreHorizontal` with `Menu` (more futuristic / control-panel feel) — kept as a Lucide icon, same intent.

### 3. Futuristic icon treatment (same icons, new styling)
Apply consistently in the `Tile` component and raised "+" button:
- `strokeWidth={1.5}` on all Lucide icons for a thinner, sci-fi line weight.
- Wrap each tile icon in a subtle hex-like square halo: inner `rounded-xl` chip with `bg-[oklch(0.82_0.14_85/0.06)]` + inset border `inset-shadow-[0_0_0_1px_oklch(0.82_0.14_85/0.2)]`, active state swaps to gold gradient chip with `drop-shadow-[0_0_6px_oklch(0.82_0.14_85/0.55)]` glow on the icon.
- Slight icon size bump (`h-[18px] w-[18px]`) and label letter-spacing `tracking-[0.08em]` uppercase for a HUD vibe.
- Raised `+` button: keep gold gradient, add animated outer ring `ring-2 ring-[oklch(0.82_0.14_85/0.35)]` + `before:absolute before:-inset-1 before:rounded-full before:bg-[oklch(0.82_0.14_85/0.15)] before:blur-md` glow halo.
- Pill border upgraded to `border-[oklch(0.82_0.14_85/0.4)]` with a faint top highlight via `bg-gradient-to-b from-[oklch(0.22_0.04_60/0.9)] to-[oklch(0.16_0.03_60/0.85)]` for layered depth.

### 4. Layout tweak
- Pill keeps `max-w-3xl mx-auto`, but inner flex becomes: `[More tile] · [centered nav with raised + tile] · [Notifications + AccountMenu]`.
- Remove brand padding (`pe-1`) since brand is gone from the pill.
- Add left padding on `<main>` only on large screens (`lg:pl-24`) so the fixed logo never overlaps page content header.

## Out of scope
- No nav items, routes, i18n, or business logic changes.
- No new files.
