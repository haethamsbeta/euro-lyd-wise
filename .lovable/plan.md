## Replicate the mockup toolbar look on the top bar

Reference: `src/assets/daham-mockup.png` (bottom nav of the mobile mockup).
Visual language to port to the back-office floating top toolbar:

- Soft ivory/cream pill on a thin gold hairline, deep soft drop shadow
- Each entry = **icon above label** in a rounded-square hit-area
- Active item lifts with a gold-gradient pill + gold ring + glow
- A single **raised gold circular action** floats above the bar centerline (in the mockup it's "Scan / Pay" — for the back-office it becomes **"+ New Transaction"** since that's the most-used staff action)
- 3-dots/"More" entry on the far right with the same icon-over-label treatment

### Files

**Edit `src/components/app/app-shell.tsx`**

Rebuild the floating header pill:

- Container: `rounded-3xl` (not full-pill), `border border-[oklch(0.82_0.14_85/0.3)]`, `bg-[oklch(0.18_0.03_60/0.85)] backdrop-blur-xl`, `shadow-[0_18px_40px_-18px_oklch(0.82_0.14_85/0.45)]`, max-w-3xl, centered.
- Brand on the far start (DahabCoin only on mobile, coin + wordmark on ≥sm).
- Center cluster = primary nav rendered as **icon-over-label tiles** (~56×52, `rounded-2xl`):
  - Inactive: muted icon, 11px label, hover gold tint.
  - Active: gold-gradient background, dark text, soft inner highlight + outer gold glow.
  - Items (admin shown):
    1. Dashboard
    2. Transactions
    3. **(raised center)** New Transaction — gold circular button (`h-12 w-12`), gold gradient, white `+` (PlusCircle), `-translate-y-3`, sits visually above the bar, `shadow-gold` ring. Label "New" beneath, outside the lifted circle.
    4. Holders
    5. Approvals (admin) / Vaults (fallback)
- Right cluster: NotificationBell, Account avatar, and a "More" tile (MoreHorizontal icon + "More" label) opening the existing dropdown with all overflow nav + Language/Theme toggles inline at the bottom.
- Mobile (<md): keep brand + 3 highest-priority tiles (Dashboard, raised New, More); rest live in More menu.
- Sticky `top-3`, page content gets `pt-4 sm:pt-6` to clear the bar.

No nav entries or routes change. No business logic touched. Only `app-shell.tsx` is edited.

### Why these choices

- Icon-over-label + raised gold center directly mirrors the mockup's bottom nav rhythm.
- Keeping the dark glass shell preserves the established "dark luxury" theme while still echoing the mockup's gold-on-cream chip energy via the active state.
- "+ New Transaction" as the raised action matches the mockup intent (most-used quick action) without inventing new routes — it links to existing `/app/transactions/new`.
