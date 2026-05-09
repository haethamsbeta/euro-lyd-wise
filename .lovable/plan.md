## Goal

Polish the dashboard (`/app`) for desktop (`lg:` and up) only. Phone, tablet, and the bottom dock visibility stay exactly as they are.

## Scope

- File touched: `src/routes/app.index.tsx`.
- All changes are gated to `lg:` / `xl:` breakpoints. Anything `< lg` (phone & tablet) renders byte-for-byte identical CSS.
- No data, query, or business-logic changes. Bottom dock stays visible on every breakpoint.

## Issues observed on web (1536×864 screenshot)

1. Big black gap between the header and "Good morning" greeting — top padding is too generous on desktop.
2. Content stretches edge-to-edge — other pages (Groups) use `max-w-7xl mx-auto`, the dashboard does not.
3. Hero "Network Pulse" card: LYD total in `text-5xl` dominates while the 3 currency tiles squeeze into the right half.
4. Quick Actions row: 3 huge cards with just an icon + label = wasted vertical space on desktop.
5. 3-column body grid is imbalanced — left column ends at the vaults; right column extends well below with Pinned + Approvals + Holdings, leaving a large empty void on the left.
6. Cash/Bank vault cards have oversized decorative icons (`w-32 h-32`) that crowd the gauge ring on desktop.

## Changes (all `lg:` / `xl:` only)

1. **Page container & spacing**
   - Wrap dashboard content in `lg:max-w-7xl lg:mx-auto`.
   - Reduce top padding on `lg:` from `lg:p-8` outer + `pt-6` shell to a tighter `lg:pt-4 lg:px-8 lg:pb-12`.
   - Tighten vertical rhythm: `space-y-6` → `lg:space-y-5`.

2. **Header greeting row**
   - On `lg:` shrink the H1 from `sm:text-3xl` to `lg:text-[26px]` and reduce bottom margin so the hero sits closer.

3. **Hero — Network Pulse card**
   - On `lg:` switch flex split from 1:1 to **5:7** (left:right) so the 3 currency tiles get more room and the headline number isn't visually crushing them.
   - Reduce headline from `sm:text-5xl` to `lg:text-4xl xl:text-[44px]` so it scales gracefully on wide screens without dwarfing the tiles.
   - Currency tile internals unchanged below `lg:`.

4. **Quick Actions**
   - On `lg:` change the inner card layout to **icon-left + label-right** (horizontal), reduce padding from `p-4` to `lg:p-3`, and shrink the icon chip from `w-10 h-10` to `lg:w-9 lg:h-9`. Cards become a slim action strip instead of three tall blocks.
   - Mobile/tablet keeps the existing centered stacked layout.

5. **Body grid rebalance**
   - On `lg:` change column ratio from `lg:col-span-2` (2/3 + 1/3) to a balanced `lg:grid-cols-12` with left = `lg:col-span-7`, right = `lg:col-span-5`.
   - Move the **Holdings Summary** widget from the right column into the bottom of the left column on `lg:` (rendered conditionally based on breakpoint via two render slots; below `lg:` it stays where it is via the existing right-column position so phone/tablet ordering doesn't change).
     - Implementation: render `HoldingsSummary` twice with `hidden lg:block` / `lg:hidden` so source order on small screens is identical to today.
   - Result: left col now holds Vaults row + Holdings; right col holds Pinned + Urgent Approvals. Heights even out.

6. **Vault cards (Cash / Bank)**
   - On `lg:` shrink the decorative background icons from `w-32 h-32` to `lg:w-24 lg:h-24` so the gauge ring and rows breathe.
   - No change to gauge percent, rows, or any data.

7. **Recent Transactions table**
   - On `lg:` add a subtle `lg:max-h-[420px] lg:overflow-y-auto` if the table overflows; otherwise keep as-is. Header sticky inside the scroll container.

## Out of scope (explicitly NOT touched)

- Bottom dock (visibility, spacing, FAB) — unchanged on every breakpoint.
- Phone & tablet styles — every change above is prefixed with `lg:` / `xl:` so smaller breakpoints are byte-identical.
- Other routes (Holders, Transactions, Vaults, Reports, Groups, Approvals).
- App shell header, search, notifications, role switcher.
- Customize panel (`CustomizeSheet`) and its preferences.

## Acceptance check

- 1536×864 desktop: less top whitespace, content centered with sane max width, hero feels balanced (currency tiles occupy more horizontal share), quick actions are slim, left and right columns end at roughly the same vertical position.
- 390×844 phone & 820×1180 tablet: pixel-identical to current build (verified by side-by-side screenshot).
- Bottom dock still appears on all breakpoints.
