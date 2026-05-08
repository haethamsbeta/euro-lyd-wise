## Goal

Add the MagicPatterns Section 19 **floating bottom dock** to the DAHAB back-office. The dock becomes the primary navigation surface; the topbar is simplified accordingly. No backend, route, role, or transaction-flow changes.

## What changes

1. New component `src/components/app/bottom-dock.tsx` — floating pill + raised gold FAB + role-aware items + animated active dot.
2. Edit `src/components/app/app-shell.tsx` — remove the center raised "+" tile and the inline tablet/desktop tile rows from the topbar; render `<BottomDock />` once below `<Outlet />`; add bottom padding compensation; auto-hide on the wizard.
3. No route/file changes elsewhere. Existing routes are reused.

## Bottom dock spec (Section 19)

**Container**
- `fixed bottom-0 inset-x-0 z-20 pointer-events-none` outer wrapper.
- Ambient glow: `absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-24 bg-gold/10 blur-3xl`.
- Inner pill: `pointer-events-auto max-w-2xl mx-4 mb-3 h-16 rounded-2xl bg-card/90 backdrop-blur-xl border border-gold/20`, shadow `0 -8px 32px rgba(0,0,0,0.5), 0 0 0 1px oklch(var(--gold)/0.08)`. Add `pb-[env(safe-area-inset-bottom)]` wrapper for iOS safe area.
- Top hairline: `absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent`.
- Mount animation via framer-motion (already available): `y:100→0`, `opacity:0→1`, spring `bounce:0.15 duration:0.5 delay:0.1`.

**Three regions** inside pill: `flex items-center justify-around px-2`. Left `flex-1 justify-around` (2 items), center FAB (or `w-2` filler), right `flex-1 justify-around` (2 items).

**Center FAB** — links to `/app/transactions/new`
- `w-14 h-14 rounded-full -mt-7 mx-2 border-2 border-background`.
- Background = existing `bg-gradient-gold` token, shadow `0 8px 24px oklch(var(--gold)/0.5), inset 0 1px 0 rgba(255,255,255,0.3)`; hover bumps to `0 8px 32px oklch(var(--gold)/0.7)`.
- Inner `<span className="absolute inset-0 rounded-full bg-gold/30 opacity-30 animate-ping" />`.
- `<Plus strokeWidth={2.5} className="w-7 h-7 text-primary-foreground group-hover:rotate-90 transition-transform duration-300" />`.
- `aria-label="New Transaction"`. Visible only when role permits (see config). Hidden via filler `<div className="w-2" />` otherwise.

**DockItem** — vertical stack
- `<Link>` with `flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl`.
- Inactive `text-muted-foreground hover:text-foreground hover:bg-gold/10`. Active `text-gold`.
- Icon `w-5 h-5`, label `text-[10px] font-medium tracking-wide`, with `aria-current="page"` when active.
- Animated active dot: `<motion.div layoutId="dock-active-dot" className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold" style={{ boxShadow: "0 0 8px oklch(var(--gold)/0.8)" }} />`.
- Optional badge: `absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground rounded-full text-[9px] font-bold min-w-[14px] h-[14px] px-1 flex items-center justify-center`.

**Role-aware config** (using existing `AppRole` from `src/lib/auth.tsx`)
```
admin:    left=[Dashboard,Transactions]  fab=true   right=[Holders,Approvals]
teller:   left=[Dashboard,Transactions]  fab=true   right=[Holders,Vaults]
auditor:  left=[Dashboard,Transactions]  fab=false  right=[Holders,Audit]
consumer: left=[Dashboard]                fab=false  right=[]
```
Items reuse the existing `NAV` definitions and routes already declared in `app-shell.tsx`. No new routes.

**Approvals badge** — real data only. Reuse the existing `["approvals"]` query (count of `transactions.status='pending'`). For Admin role only; hide badge when count=0 or query is loading. Implement with a small `useQuery(["approvals.count"])` in the dock that selects only `id, count` to avoid pulling full rows; reuses existing RLS so non-admins won't see it anyway.

**Auto-hide** — `const hideDock = location.pathname.startsWith('/app/transactions/new')`. When hidden, also skip the bottom padding.

**Page padding** — apply on `<main>` only when dock visible: `pb-28 md:pb-24`. Wizard route keeps its own sticky action bar (no overlap).

## Topbar changes (`app-shell.tsx`)

- Remove the raised center "+" tile and the desktop/tablet center nav rows (left/right tiles + raised). Center area becomes a flexible spacer (or future search slot).
- Keep: hamburger (More) → drawer with full nav, DAHAB logo on left, NotificationBell on right, plus existing language/theme/account already inside the More drawer.
- Add a 1px gold gradient hairline at the very bottom of the header: `absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent pointer-events-none`.
- Topbar keeps z-30, dock z-20, drawer z-50 — already correct.
- Global search bar: NOT adding now (no global search backend exists today; would require new feature). Leave a placeholder-free clean topbar; we can add later if you want.

## Files

- **Create** `src/components/app/bottom-dock.tsx` — exports `BottomDock`. Encapsulates pill, FAB, items, dot, badge, and role config. Imports lucide icons (`LayoutDashboard, ArrowRightLeft, Users as UsersIcon, Wallet, ClipboardCheck, ScrollText, Plus`), uses `useAuth` for roles, `useLocation` for active route, `framer-motion` for entrance + `layoutId` dot.
- **Edit** `src/components/app/app-shell.tsx`:
  - Strip center nav blocks (desktop, tablet, mobile raised).
  - Add hairline div at bottom of `<header>`.
  - Compute `hideDock`, wrap `<main>` className conditionally with `pb-28 md:pb-24`.
  - Render `<BottomDock />` after `<Outlet />` when not hidden.
  - Keep `MoreButton`, drawer, NotificationBell, AccountMenu, language/theme intact.

## Privacy / no-regression guardrails

- Dock items are filtered through existing `hasAnyRole` logic; non-admins never get Approvals badge data (RLS already blocks it).
- No balances are exposed in the dock (icons/labels only).
- Existing `/app/transactions/new` wizard keeps its sticky action bar; dock is hidden on that route.
- No changes to routes, `routeTree.gen.ts`, auth, RPC, or the wizard component.

## Verification

- TypeScript build passes (existing automatic check).
- Manually verify: dock visible on `/app`, `/app/transactions`, `/app/holders`, `/app/vaults`, `/app/approvals`, `/app/audit`; hidden on `/app/transactions/new` (and `?type=...`).
- Active dot slides smoothly between items.
- FAB hidden for auditor; visible for admin/teller.
- Approvals badge shows live pending count for admin only.
- Mobile (current viewport 768): pill fits within `mx-4`, FAB centered, no overflow.
