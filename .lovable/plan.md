## Why you don't see changes yet

The Night theme tokens are correctly defined in `src/styles.css` and `<html>` already gets `dark theme-night`, but the individual pages (Dashboard, Holders, Transactions, Vaults, Approvals, Audit, Reports, Portal, Mobile Teller) still render with the **old card components, light gradients (`card-luxe`), warm sand backgrounds, and beige borders**. So the body turns dark, but every card on top of it stays cream-colored — that's why it "looks the same".

This plan replaces the actual page surfaces with the premium dark mockup look, end-to-end.

## What I'll change

### 1. CSS — make the new look the *default*, not opt-in (`src/styles.css`)
- Rewrite `.card-luxe` so under `theme-night` it renders as the mockup's **glass card**: `#161B22` surface, 1px gold-tinted border (`rgba(212,168,87,0.18)`), inner highlight, deep shadow, optional radial gold halo at top.
- Add reusable utilities used by every page:
  - `.premium-surface` — base dark card
  - `.premium-surface-hover` — gold hairline + lift on hover
  - `.gold-divider` — horizontal hairline with gold gradient
  - `.metric-value` — Fraunces serif, tabular-nums, cream
  - `.metric-label` — uppercase 11px tracked muted label
  - `.kpi-trend-up` / `.kpi-trend-down` — emerald/red chips
  - `.table-luxe` — dark table with `#1F2530` header, hover row tint, gold-row separator
  - `.chip-currency-{usd,eur,lyd}` — colored currency pills
  - `.btn-gold-gradient` — gold metallic CTA (replaces ad-hoc gradients)
- Override shadcn `Card`, `Input`, `Select`, `Tabs`, `Table` defaults under `html.theme-night` so EVERY existing usage automatically picks up dark surfaces, gold focus rings, and cream text — no per-component edits needed.
- Add ambient page wash: subtle gold mesh top-left + bottom-right corner gradients on `<body>`.

### 2. App shell (`src/components/app/app-shell.tsx`)
- Sidebar: switch from current rail to mockup's **`#0B0E13` rail with 1px gold hairline divider, gold active pill, gold dot indicator on hover**.
- Top bar: dark blur strip with gold underline, serif page title, search input with gold focus ring, notification bell + theme toggle + account menu in gold-bordered chips.
- Brand block: DAHAB wordmark in serif gold + ذهب in muted Amiri below.
- Mobile: dark drawer with same treatment.

### 3. Dashboard (`src/routes/app.index.tsx`)
- Replace plain `<Card>` with `PremiumCard` wrappers.
- Currency totals strip: 3 large premium cards (USD/EUR/LYD), each with currency chip top-left, big serif metric, hairline, "Cash + Bank" breakdown, faint Landmark watermark.
- Cash Vaults / Bank Vaults: dark glass cards with avatar dots, channel chip, balance row.
- Recent Transactions: `table-luxe` with direction icon (gold up / red down), gold tx number, status badge, timestamp.
- Pinned Customers + Holdings Summary: same premium-surface treatment.
- Quick Actions row of `btn-gold-gradient` buttons (admin/teller only).
- Header: serif "Dashboard", welcome line, [🛡 Pending Approvals (n)] gold-outline button (admin only), [⚙] settings drawer.

### 4. Holders (`src/routes/app.holders.index.tsx` + `app.holders.$id.tsx`)
- KPI header strip (total holders, total accounts, per-currency counts) using `KpiCard`.
- Holder list as **premium rows** (avatar disc with initials in gold, name in serif, DAHAB number muted, currency chips on the right).
- Detail page: hero card with gold rim, tabs in dark pill style, account chips, statement ledger restyled with `table-luxe`.

### 5. Transactions (`src/routes/app.transactions.*`)
- List: `table-luxe`, sticky filter bar with dark glass background, currency/status/direction chips, pagination buttons in gold-outline.
- Detail: two-column premium card layout with audit timeline on the right.
- New transaction (`entry-form.tsx`): 3-step wizard inside a single premium card — Direction → Customer/Account/Vault → Amount/Comment. Gold progress dots, secondary cancel button.

### 6. Vaults (`src/routes/app.vaults.*`)
- Vault tiles: premium cards with channel icon (Cash/Bank), currency chip, big balance metric, last-movement footer.
- Vault detail: hero card + ledger table in `table-luxe`.

### 7. Approvals (`src/routes/app.approvals.tsx`)
- Two-pane layout: left queue (premium cards with status hairline), right detail panel (gold-rim card with Approve = `btn-gold-gradient`, Partial = secondary, Reject = danger).

### 8. Audit (`src/routes/app.audit.tsx`)
- Replace slate-tinted action chips with theme-aware tone classes (`.tone-info`, `.tone-warn`, `.tone-success`, `.tone-danger`) that use the night palette.
- Timeline list inside premium-surface, with gold connector line.

### 9. Reports (`src/routes/app.reports.tsx`)
- Wrap existing recharts in `ResponsiveContainer` with explicit `minHeight` to fix the console warning ("width(-1) and height(-1)").
- Restyle KPI cards to match mockup, give chart cards gold rims, switch chart colors to gold palette already declared.

### 10. Consumer Portal (`src/routes/portal.tsx`, `portal.$accountId.$currency.tsx`)
- Dark hero card with welcome + account selector chips.
- Statement ledger as `table-luxe`.
- Strictly preserves existing RLS-bound queries (no logic change).

### 11. Mobile Teller (`src/routes/m.*`)
- `m.login.tsx`: dark card on gold-mesh background, serif heading, gold CTA.
- `m.dashboard.tsx`: dark hero with currency chips (replace hardcoded `bg-white/90` chips with theme-aware `.chip-currency-*`), recent tx list as premium rows.

### 12. Auth pages (`login`, `forgot-password`, `reset-password`, `change-password`, `index`)
- Dark mesh background, premium card centered, gold CTA, brand mark on top.

### 13. Cleanup
- Remove hardcoded `bg-white/90`, `bg-slate-500/10`, etc. found in `m.dashboard.tsx` and `app.audit.tsx`.
- Ensure all icons used inside gold pills get `text-primary-foreground` not raw white.
- TypeScript: no broken imports; no changes to `supabase/{client,types}.ts`, `.env`, `routeTree.gen.ts`, RLS, RPCs, or routes.

## What stays the same
- All Supabase queries, mutations, RLS, role gating, auth flow, RPC names.
- Every existing route URL and parameter.
- All business rules (withdraw approval threshold, partial approve, double-entry).
- No new tables, no new dependencies beyond what's already installed (`recharts` is in).

## Files touched
**Edit:** `src/styles.css`, `src/components/app/app-shell.tsx`, `src/components/app/entry-form.tsx`, `src/components/app/statement-ledger.tsx`, `src/components/app/notification-bell.tsx`, `src/components/app/account-menu.tsx`, `src/routes/app.index.tsx`, `src/routes/app.holders.index.tsx`, `src/routes/app.holders.$id.tsx`, `src/routes/app.transactions.index.tsx`, `src/routes/app.transactions.$id.tsx`, `src/routes/app.transactions.new.tsx`, `src/routes/app.vaults.index.tsx`, `src/routes/app.vaults.$id.tsx`, `src/routes/app.approvals.tsx`, `src/routes/app.audit.tsx`, `src/routes/app.reports.tsx`, `src/routes/app.users.*`, `src/routes/app.settings.*`, `src/routes/portal.tsx`, `src/routes/portal.$accountId.$currency.tsx`, `src/routes/m.login.tsx`, `src/routes/m.dashboard.tsx`, `src/routes/login.tsx`, `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx`, `src/routes/change-password.tsx`, `src/routes/index.tsx`.
**Use existing:** `PremiumCard`, `KpiCard`, `CurrencyBadge`, `StatusBadge`, `SectionHeader`, gold `Button` variant.

After this, the entire back-office, portal, and mobile teller will visually match the dark-luxury mockup — not just the body background.
