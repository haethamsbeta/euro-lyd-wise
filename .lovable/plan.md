## Goal

Restyle `/app/groups` (file: `src/routes/app.groups.index.tsx`) to match the supplied DAHAB Groups Landing visual brief. Pure presentation work — keep all existing data fetching (`api.groups.list`), mutations (pin/edit/delete), filter/sort state, role checks, modals, and navigation handlers exactly as they are.

## Scope

Only `src/routes/app.groups.index.tsx`. No changes to `src/lib/api/groups.ts`, route tree, modals' internal logic, or any backend/types. i18n keys reused where they already exist; new visible labels added inline as English strings (matches current file convention — translation can be a follow-up).

## Changes

### 1. Page frame
- Outer `space-y-6 pb-12` inside existing shell wrapper. Keep `max-w-7xl` container.

### 2. Header
- Eyebrow: small gold `Sparkles` + `Organization` (`text-[10px] tracking-[0.25em] uppercase text-gold`).
- H1: `Groups` — `text-2xl font-playfair font-semibold text-primary`.
- Subtitle replaced with: "Organize holders into families, corporate groups, trusts, branches, and VIP tiers."
- Keep existing `New Group` button + role/writesDisabled tooltip logic; just align styling (`gap-2`, Plus icon).

### 3. KPI strip (4 cards, framer-motion stagger)
Replace current `KpiCard` usage with new spec-compliant cards (`grid-cols-2 lg:grid-cols-4 gap-4`, `p-5`, gold icon chip 8×8, eyebrow label, `text-2xl tabular-nums` value, fade-up `delay: i*0.05`):
1. Total Groups — `FolderTree`
2. Unique Members — `Users` (use existing `totalMembers`)
3. Combined Balance — `TrendingUp` (top-currency LYD-formatted from `managedTotals`)
4. Created (14d) — `Activity` (compute client-side from `groups` `created_at`, no backend change)

Hide balance card behind `canViewBalances` like today (fall back to existing alt KPI).

### 4. Filter bar
Single `Card p-4` with flex row:
- Search input (flex-1) with absolute magnifier, gold focus ring, placeholder updated.
- Type chip row (horizontally scrollable, `scrollbar-none`) led by `Filter` icon. Chips: All, Family, Corporate, Trust (map to existing `business`/`investment`?), Branch, VIP. Use `TYPE_ORDER` to render only existing types — keep current filter behaviour; relabel chips per brief where types match (`family`, `corporate`, `vip`); keep `general/business/investment/savings` chips as-is to avoid functional change.
- Sort: native `<select>` styled per brief (replace current shadcn `Select` to match the spec exactly) with `ArrowUpDown` icon. Options: Name (A→Z) → `name`, Most Members → `members`, Highest Balance → new client-side sort by sum of `totals_by_currency`, Recently Created → `newest`. Keep `pinned` as default ordering applied on top regardless (so star-pinned cards float to top — matches spec section 10).

### 5. Empty state
Wrap existing `EmptyZeroState` / `EmptyFilteredState` in a single `Card p-12`. Texts updated:
- "No groups found" / dynamic description with search term / "Create Group" CTA gated on no-search + canMutate.

### 6. Grid
`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`, motion stagger `delay: i*0.04`.

### 7. GroupCard rebuild (in-file component)
Restructure the existing `GroupCard`:
- Wrapper: `relative p-5 rounded-xl border bg-surface cursor-pointer transition-all duration-300 group`; pinned uses `border-gold/40` + type glow ring from `TYPE_META`.
- Top row: 11×11 type-icon square (tinted bg/border from TYPE_META); right side has Pin star (filled gold when pinned, fade-in on hover otherwise) + 3-dot `MoreVertical` menu (hover-revealed). Both buttons keep `e.stopPropagation()` and existing handlers. Replace current `DropdownMenu` shadcn with custom absolute panel + click-shield as specified, using framer-motion `AnimatePresence`.
- Name (`text-lg font-semibold text-primary truncate`) + type pill (`uppercase text-[10px] tracking-wider`) + description (`text-xs text-text-secondary line-clamp-2 min-h-[32px]`).
- Member avatars row: overlapping (`-space-x-2`) up to 4 avatars from `g.members` (only if available — current `AccountGroup` type has `member_count` but no member objects; fall back to N initialled placeholders using `member_count`). Overflow `+N` chip. Right-side `{N} members` count. If 0 → italic placeholder.
- Currency breakdown strip:
  - Header `Balances · 30d Activity` + `{accountCount} acct(s)`.
  - Up to 3 rows from `g.totals_by_currency` rendered with `CurrencyBadge`, `formatCompactCurrency`, and 30d credits/debits. The 30d numbers don't exist on `AccountGroup` today; render the slot only if data present (gracefully omit), so no backend dependency is added.
  - Footer `+ N more currency/currencies` if >3.
  - Empty: dashed-border placeholder "No accounts in this group yet".
- Footer: left `LYD Equivalent` label + LYD-converted total (use existing `managedTotals` logic per group, or sum LYD entry directly); right `View accounts →` gold link with hover translate.

### 8. TYPE_META
Keep existing palette (already covers more types than the brief). Apply per spec to icon square / pill / pinned glow.

### 9. Motion
Add framer-motion to KPI cards, group cards, and dropdown. `framer-motion` is already used elsewhere in project — verify import works (no install needed if present; otherwise add via `bun add framer-motion`).

### 10. Out of scope (unchanged)
- API calls, query keys, mutation logic, modals (`GroupModal`, delete `AlertDialog`).
- Role/permission rules.
- Routing.
- `src/lib/api/groups.ts` and `AccountGroup` type.
- Top toolbar / bottom dock.

## Acceptance
- Visual layout matches brief sections 1–10.
- All existing buttons/links still navigate and mutate identically.
- No new network calls, no new fields required from backend.
- Build passes; no console errors.
