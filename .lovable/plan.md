## Goal
Refresh the DAHAB app with a cleaner, more modern, slightly futuristic feel — sharper typography, well-defined list rows, and elevated card styling — while keeping the gold/cream/onyx brand palette intact.

## 1. Typography refresh (`src/styles.css`)

- Swap body sans from **Inter** to **Inter Tight** (tighter tracking, more modern silhouette) with Inter as fallback.
- Swap serif from **Playfair Display** to **Fraunces** (variable, softer/more contemporary, supports `opsz` + soft style) for headings, balances + gold tones.
- Keep **JetBrains Mono** for numbers (account numbers, balances).
- Keep **Cairo / Amiri** for Arabic (`html[lang="ar"]`).
- Add Google Fonts `<link>` preconnect + stylesheet in `src/routes/__root.tsx` head.
- Adjust base styles:
  - body `font-feature-settings: "ss01","ss02","cv11","tnum"` (tabular numbers, stylistic alternates).
  - tighten heading tracking (`-0.02em`), increase weight scale (h1 600, h2 550 via Fraunces variable).
  - Default `font-size` lifted from 14 → 15px on desktop for clearer reading; mobile unchanged.
  - Add `.num` utility: `font-variant-numeric: tabular-nums; font-family: var(--font-mono);` for amounts.

## 2. New "futuristic" surface utilities (`src/styles.css`)

Add reusable classes used everywhere instead of editing each component:

- `.card-futur` — card with subtle gold inner-stroke, glassy gradient, soft drop shadow + 1px gold rim on hover.
- `.row-luxe` — list row: rounded-lg, 1px border, hover lift (translateY -1px) + gold glow, focus ring.
- `.list-stack` — applies `display:flex; flex-direction:column; gap:0.5rem` so all lists become spaced boxes (not flat dividers).
- `.chip` — refined pill (used for currency, status) with backdrop blur and soft border.
- `.kbd-num` — tabular-mono number style for balances/IDs.
- `.section-title` — uppercase 11px tracked label with gold underline accent.

These build on existing tokens (`--gold`, `--shadow-elegant`, `--shadow-rim`, `--gradient-gold`) so dark / cream / night themes all work automatically.

## 3. Apply across the app

Replace flat list/card markup with the new utilities — no behavior changes, only className updates.

| File | Change |
|---|---|
| `src/components/app/app-shell.tsx` | Sidebar items → `row-luxe` style; top header gets thinner gold hairline. |
| `src/routes/app.index.tsx` (dashboard) | KPI tiles → `card-futur`; numbers → `.num`. |
| `src/routes/app.holders.index.tsx` | Holder rows → `row-luxe` inside `list-stack`; created_at uses `.num`. |
| `src/routes/app.holders.$id.tsx` | Header card → `card-futur`; linked-accounts list → `list-stack` of `row-luxe`. |
| `src/routes/app.groups.index.tsx` | Group cards → `card-futur`; member count + `CurrencyTotalsStrip` aligned in a clearer header band. |
| `src/routes/app.groups.$id.tsx` | Member list → `list-stack` / `row-luxe`; totals strip elevated. |
| `src/routes/app.transactions.index.tsx` | Transaction rows → `row-luxe`; amounts `.num`; status chips → `.chip`. |
| `src/routes/app.vaults.index.tsx`, `app.vaults.$id.tsx` | Vault tiles → `card-futur`. |
| `src/routes/app.approvals.tsx`, `app.audit.tsx`, `app.users.tsx` | Tables/lists wrapped with `list-stack` + `row-luxe`. |
| `src/components/app/currency-totals-strip.tsx` | Pill style upgraded to `.chip` + `.num`. |
| `src/components/app/statement-ledger.tsx` | Numbers → `.num`; row hover → `row-luxe`. |
| `src/components/ui/card.tsx` | Default `Card` gets `card-futur` base class so anywhere using `<Card>` benefits without rewrites. |
| `src/components/ui/badge.tsx` | Slight refinement (border + backdrop) for chip-like feel. |

## 4. Group card member-count fix (carry-over)

`app.groups.index.tsx` group cards still don't show member count before clicking. Add `members_count` (or count from already-fetched members array) into the header next to the group name as a `.chip` (`{n} members`).

## 5. QA

- Verify all three themes: cream `.dark`, light `:root`, night `html.theme-night` — all use the same tokens so utilities work automatically.
- Verify Arabic (`html[lang="ar"]`) keeps Cairo/Amiri (typography rule already scoped).
- Quick visual pass on holders / groups / transactions / dashboard.

## Out of scope

- No backend / API wiring changes (still in pre-connect prep mode).
- No data model changes.
- No route additions.

## Files touched (summary)

Edited: `src/styles.css`, `src/routes/__root.tsx`, `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/app/currency-totals-strip.tsx`, `src/components/app/statement-ledger.tsx`, `src/components/app/app-shell.tsx`, and the route files listed above.

No new files, no new dependencies (Google Fonts via `<link>`).
