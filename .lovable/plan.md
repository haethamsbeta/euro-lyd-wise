
# DAHAB Family Portal — Full Visual Upgrade Plan

Goal: keep all existing Supabase logic, RLS, RPCs, server functions, auth, and routes intact. Reskin the entire app to match the uploaded mockup's premium dark+gold private-banking aesthetic, fill missing pages, and translate every visual detail (colors, gradients, shadows, typography, motion) from the mockup into our Tailwind v4 + shadcn system.

The mockup uses Tailwind v3, react-router-dom, framer-motion, hardcoded `text-primary`/`font-playfair`. We will **not** copy its source files; we translate its tokens into our `src/styles.css` and shadcn primitives so everything compiles and stays type-safe.

---

## 1. Exact design tokens (translated into `src/styles.css`)

Re-tune the existing `theme-night` block so utility classes (`bg-background`, `bg-card`, `text-foreground`, `text-gold`, `border-border`, etc.) resolve to mockup-exact values, and add brand aliases so we can also use `bg-surface`, `bg-surface-2`, `text-gold-soft`, etc., directly:

| Token | Value | Mockup origin |
|---|---|---|
| `--background` (bg-base) | `#0B0E13` | deep charcoal app bg |
| `--bg-elevated` | `#14181F` | elevated panel |
| `--card` / `--surface` | `#161B22` | card surface |
| `--surface-2` | `#1F2530` | hover, table head |
| `--surface-3` | `#2A3140` | tertiary |
| `--foreground` / `--text-primary` | `#F5F1E8` | cream off-white |
| `--muted-foreground` / `--text-secondary` | `#8B8A85` | warm gray |
| `--text-tertiary` | `#5C5B57` | tertiary muted |
| `--border` | `#2A2D35` | subtle dark border |
| `--border-gold` | `rgba(212,168,87,0.25)` | gold hairline |
| `--gold` | `#D4A857` | metallic gold |
| `--gold-soft` | `#E8C570` | soft highlight |
| `--gold-deep` | `#A8842F` | deep bronze |
| `--gold-glow` | `rgba(212,168,87,0.15)` | ambient glow |
| `--success` | `#34D399` | deposit/approved |
| `--warning` | `#F59E0B` | pending |
| `--destructive` | `#EF4444` | withdraw/rejected |
| `--primary` | gold gradient | CTA |
| `--ring` | `rgba(212,168,87,0.4)` | gold focus |
| `--chart-1..5` | `#D4A857`, `#E8C570`, `#A8842F`, `#F0D080`, `#34D399` | reports palette |

Defaults: force the staff app, login, and consumer portal to `theme-night` (dark always). Light theme stays available only as a toggle.

Add reusable utilities (matching the mockup `index.css`):

- `body::before` — fixed ambient gold radial mesh:  
  `radial-gradient(circle at 15% 10%, rgba(212,168,87,.06), transparent 40%), radial-gradient(circle at 85% 90%, rgba(212,168,87,.04), transparent 45%)`.
- `.gold-hairline` — 1px `linear-gradient(90deg, transparent, var(--gold), transparent)`.
- `.gold-border-glow` — `border: 1px solid rgba(212,168,87,.25); box-shadow: 0 0 0 1px rgba(212,168,87,.05), 0 8px 32px rgba(0,0,0,.4)`.
- `.glass-card` — `linear-gradient(135deg, rgba(22,27,34,.85), rgba(31,37,48,.7))` + `backdrop-blur(20px)` + gold/15 border.
- `.shadow-gold-glow` — `0 0 24px rgba(212,168,87,.2)`.
- `.shadow-premium` — `0 8px 32px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.04)`.
- `.bg-gold-gradient` — `linear-gradient(135deg, #E8C570 0%, #D4A857 50%, #A8842F 100%)`.
- `.bg-gold-mesh` — same as body mesh, scoped.
- `.tabular-nums { font-variant-numeric: tabular-nums; }` (already exists, keep).
- Custom scrollbar: 8px, track `--background`, thumb `--surface-2`, hover `--gold-deep`.
- Selection: background `--gold`, color `#14181F`.

Fonts: keep Inter for body, Fraunces (already aliased to Playfair) for `font-serif`. Add a CSS rule so all `<h1>`–`<h3>` defaults to `font-serif tracking-tight`. No Tailwind alias for `font-playfair` is needed (we never import mockup files).

## 2. Brand & shared visual components

`src/components/brand/dahab-mark.tsx` — confirm/upgrade to mockup spec:
- Wordmark "DAHAB" in `font-serif`, weight 600, letter-spacing `0.18em`, gradient `from-[#F0D080] via-[#D4A857] to-[#A8842F]` clipped to text.
- Subtitle "FAMILY PORTAL" in `text-muted-foreground`, tracking `0.25em`, uppercase, sized per `sm/md/lg/xl`.
- Optional logo image (`/logo.png`) with rounded square + `shadow-gold-glow`.
- Layouts `horizontal | vertical`.

New shadcn-aligned primitives:

- `src/components/ui/currency-badge.tsx` — uppercase pill, exact colors from mockup:  
  LYD `bg-gold/15 text-gold border-gold/30`, USD `bg-success/10 text-success border-success/30`, EUR `bg-[#7AA8E8]/10 text-[#7AA8E8] border-[#7AA8E8]/25`, GBP `bg-[#C394E0]/10 text-[#C394E0] border-[#C394E0]/25`. 10px font, tracking-wider.
- `src/components/ui/status-badge.tsx` — pill with 1.5px dot:  
  posted/completed/approved → success, pending/review → gold, rejected/failed/suspended → destructive, reversed/corrected → muted-gold neutral.
- `src/components/ui/premium-card.tsx` — wrapper around shadcn `Card` with `variant`:
  - `default` — `bg-card border-border shadow-[0_4px_16px_rgba(0,0,0,.25)]`.
  - `premium` — `bg-gradient-to-br from-card to-[--surface-2] border border-gold/20 shadow-[0_8px_32px_rgba(0,0,0,.4),0_0_0_1px_rgba(212,168,87,.08)]` + top `gold-hairline`.
  - `glass` — `.glass-card`.
  - `dark-hero` — `bg-gradient-to-br from-[#0B0E13] via-[#1A1410] to-[#14181F] border border-gold/25 shadow-[0_12px_48px_rgba(0,0,0,.5),0_0_64px_rgba(212,168,87,.08)]`.
- `src/components/ui/gold-button.tsx` — variant extension for the existing shadcn `Button`:
  - `gold` → `bg-gradient-to-b from-[#E8C570] via-[#D4A857] to-[#A8842F] text-[#14181F] font-semibold shadow-[0_4px_16px_rgba(212,168,87,.3),inset_0_1px_0_rgba(255,255,255,.3)] hover:shadow-[0_6px_24px_rgba(212,168,87,.45)]`.
  - `secondary` → `bg-surface-2 border border-gold/30 text-foreground hover:bg-surface-3 hover:border-gold/50`.
  - `ghost` → `bg-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground`.
  - `danger` → `bg-destructive/15 border border-destructive/40 text-destructive hover:bg-destructive/25`.
  - sizes: `sm h-9 px-3 text-sm`, `md h-11 px-6 text-sm`, `lg h-14 px-8 text-base`.
  - subtle motion: `whileHover scale 1.01`, `whileTap 0.98` (framer-motion is already in deps; if not, add it).
- `src/components/app/kpi-card.tsx` — gold icon chip (`bg-gold/10 text-gold border-gold/20 p-2 rounded-lg`), uppercase 10px label `tracking-[0.15em]`, large `text-2xl font-semibold tabular-nums`, optional trend pill (success/destructive arrow + %). Trend pill renders **only** when previous-period data exists.
- `src/components/app/section-header.tsx` — eyebrow (gold sparkles + 10px `tracking-[0.2em]` uppercase label), serif title `text-2xl font-semibold`, subtitle in muted, right-side actions slot.
- `src/components/app/dashboard-settings-drawer.tsx` — right-side `Sheet`, dark surface, gold borders/checkboxes, sections "Visible currencies" + "Visible widgets", persists in `localStorage` (`dahab.dashboardPrefs`).
- `src/components/app/pinned-customers.tsx` — list of pinned holders persisted in `localStorage` (`dahab.pinnedHolders`); each row uses `bg-surface-2 border-border group-hover:border-gold/50` with a gold `Star` (filled).

`src/components/app/app-shell.tsx` (edit, keep auth/role logic untouched):

- Sticky topbar `h-16 bg-background/95 backdrop-blur-md border-b border-border/60 shadow-[0_4px_20px_rgba(0,0,0,.3)]`.
- Left: hamburger button (`Menu` icon, hover `text-gold border-gold/30`) + `BrandMark`.
- Center on `lg+`: quick-access nav (Dashboard, Transactions, Holders, Vaults, Approvals) — pill style, active state `bg-gold/10 text-gold border-gold/30`, optional badge (gold pill).
- Right: search input `w-44 lg:w-56 bg-surface-2/70 border-border/60 rounded-lg pl-9 pr-10 py-1.5` with gold focus ring + `⌘K` kbd hint; "New Transaction" gold-gradient CTA (admin/teller); Notifications bell with red dot badge; role-aware avatar (gold gradient circle with initial); Language + Theme toggles.
- Sidebar drawer (the user's existing left sidebar stays, but we add the slide-in mobile/secondary drawer using shadcn `Sheet` for mockup parity): `from-background to-card` gradient, gold active left bar with `shadow-[0_0_10px_rgba(212,168,87,.5)]`, badges; auditor rows show small "Read-only" pill (`bg-gold/10 text-gold/60 text-[10px]`).

## 3. Routing fixes

- Add `src/routes/app.reports.tsx` (admin + auditor read-only).
- Add Reports nav item in `AppShell`.
- Confirm `app.transactions.new.index.tsx` opens the real chooser (deposit/withdraw cards), not a placeholder. The chooser is restyled to the mockup's "select large card" look (premium card per option, gold hover border, big icon).
- No `/backoffice/*` legacy routes exist, no redirects needed.

## 4. Dashboard — `src/routes/app.index.tsx`

Rebuilt visually to mirror the mockup exactly, using **real** data already queried elsewhere. Layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ Header                                                       │
│  ┌ "Dashboard" (font-serif text-2xl, cream)                  │
│  └ "Welcome back. Here's what's happening across the         │
│     DAHAB network today." (muted-foreground)                 │
│                              [🛡 Pending Approvals (n)] [⚙]  │
├─────────────────────────────────────────────────────────────┤
│ Currency totals strip                                        │
│  premium-card per currency, w/ Landmark watermark @ 10%      │
│  opacity (group-hover 20%), label "Network Balance"          │
│  (text-gold-soft, 12px), CurrencyBadge top-right,            │
│  amount font-serif text-3xl text-gold tabular-nums,          │
│  trend pill (TrendingUp icon + % vs last month) ONLY when    │
│  real comparison data exists.                                │
├──────────────────────────────────┬──────────────────────────┤
│ Cash Vaults  | Bank Vaults       │ Quick Actions             │
│  10×10 gold icon chip (Wallet/   │  gold-gradient New Deposit│
│  Landmark) on bg-surface-2,      │  secondary New Withdraw   │
│  per-currency rows, amount       │                           │
│  tabular-nums.                   │ Pinned Customers          │
├──────────────────────────────────┤  Star (gold, fill), name, │
│ Recent Transactions card         │  type, balance, currency. │
│  table head: bg-surface-2        │                           │
│  uppercase muted; rows hover:    │ Holdings Summary          │
│  bg-surface-2/50; deposit text-  │  big number + Users icon  │
│  emerald-400 with "+", withdraw  │  in gold/10 circle;       │
│  red-400 with "-"; tx id mono;   │  Corporate (gold) /       │
│  StatusBadge in last column;     │  Individual (success)     │
│  "View All" link in gold.        │  progress bars, 1.5px.    │
└──────────────────────────────────┴──────────────────────────┘
```

Settings drawer (right): `framer-motion` slide from `x: 100%`, dark `bg-card border-l border-border`, sections: Visible currencies (LYD/USD/EUR/GBP toggles), Visible widgets (Cash Vaults / Bank Vaults / Recent / Pinned / Holdings). Saves to localStorage.

Role behavior:
- Admin: all widgets + Pending Approvals shortcut + settings.
- Teller: hides Pending Approvals shortcut, keeps Quick Actions.
- Auditor: hides Quick Actions; everything else read-only.

Data sources (existing only): per-currency totals from current balance RPC; cash/bank vault totals from `app.vaults.index.tsx` query; recent transactions from `app.transactions.index.tsx` query (limit 5); holders count + Corporate/Individual split from holders query. **No mock numbers in production dashboard.**

## 5. Reports — new `src/routes/app.reports.tsx`

Admin + auditor read-only. Built from existing data sources (transactions, balances, holders, audit, vaults). Recharts already in deps.

Layout:
- Header: gold `Sparkles` icon + eyebrow `ANALYTICS` (10px, tracking 0.2em, gold), serif "Reports & Insights" (text-2xl), muted subtitle, right-side `Calendar` button + `Download` Export Report (gold gradient).
- KPI strip — 4 `KpiCard`s on `lg:grid-cols-4` (Network Volume 30d, Active Holders, Posted Transactions, Pending Approvals or Rejection Rate). Each: gold icon chip (top-left), trend pill (top-right) only with comparison data, eyebrow label, large tabular-nums value. Subtle stagger via framer-motion (`y:12, delay i*0.05`).
- Charts:
  1. **Daily Transactions** — `Card variant="premium"` `lg:col-span-2 p-6`. AreaChart with gradient `id="rGold"` 0→1 (`#D4A857` 0.4→0). Stroke `#D4A857`, width 2. XAxis & YAxis: `axisLine={false} tickLine={false} tick={{ fill:'#8B8A85', fontSize:11 }}`. YAxis tickFormatter compact. Tooltip: `background:'#1F2530', border:'1px solid rgba(212,168,87,.3)', borderRadius:8`.
  2. **Balance by Currency** — donut `innerRadius 50 outerRadius 80 paddingAngle 3 stroke #161B22 strokeWidth 2`. Cells use chart palette (`#D4A857, #E8C570, #A8842F, #F0D080`). Legend below with colored dot + `CurrencyBadge` + percent.
  3. **Customer Growth** — BarChart, bars `fill #D4A857 radius [6,6,0,0]`, same dark axes/tooltip.
  4. **Top Accounts** — `Card variant="premium" p-6`, ranked rows `bg-surface-2/40 border border-border hover:border-gold/30`, `#1` index in mono gold, name + currency badge, amount tabular-nums on the right; row click → `/app/holders/$id`.
- **Saved Reports** — `Card p-6` grid `md:grid-cols-2 lg:grid-cols-4`, tile: `FileText` gold icon, title (cream → hover gold), "PDF • Updated daily" (11px muted), `ChevronRight` muted → gold on hover. Each tile triggers existing PDF export where data is available; otherwise tile is rendered with a "Coming soon" badge and disabled (no fake success).

Filters bar (above KPIs): date range, currency, type, status, teller, channel, holder search. State propagates into the same queries used elsewhere.

Restrictions: no loans, cards, crypto, investments, bills.

## 6. Approvals — `src/routes/app.approvals.tsx`

Reskin to mockup's two-pane review layout. Keep `approve_transaction` / `reject_transaction` RPCs and partial-approval flow.

- Left: queue list (premium cards). Each card: tx number (mono), customer, direction icon (gold ↑/↓), currency badge, channel chip (cash/bank), requested + proposed amount (tabular-nums), teller comment preview, timestamp, review-reason badge: `insufficient_balance` → red, `exceeds_withdraw_limit` → gold, generic pending → gold/amber.
- Right: detail panel for selected row — full transaction context (parties, attachments thumbs, double-entry breakdown), Approve (gold gradient), Partial Approve (secondary, opens dialog with smaller amount input), Reject (danger, requires reason).
- After every action: toast + invalidate dashboard/transactions/approvals queries + audit log row.

## 7. New Transaction — restyle existing `EntryForm` flow

Three-step wizard with breadcrumb header and premium cards (no rebuild of submit logic):

1. **Direction** — two large selectable premium cards (Deposit / Withdraw), big arrow icon, gold border on selected.
2. **Customer/Account/Vault** — searchable customer picker, currency-bound holder account dropdown, vault side toggle (cash/bank), currency display.
3. **Amount/Comment/Attachments** — tabular-nums input, comment textarea, attachment dropzone, gold-gradient "Submit" CTA.

Withdraw over-limit / insufficient-balance: existing behavior already routes to pending — keep it; success state shows amber/gold "Sent for admin approval" alert + link to `/app/approvals`.

Deposits & in-limit withdraws: post immediately, success card with green check.

## 8. Transactions — reskin only

- Premium dark card; header search (`SearchBar` style), filters (date range, status, direction, channel, currency).
- Table: `bg-surface-2` uppercase muted header, rows hover `bg-surface-2/50`, deposit `text-emerald-400 +`, withdraw `text-red-400 -`, status & currency badges, expandable row showing parties/attachments/double-entry/reversal-correction info, teller comment, review reason if pending.
- Admin actions: Reverse, Correct, View attachments, PDF export.
- Teller: view + create only. Auditor: read-only.

## 9. Holders — list + detail reskin

**List**: KPI strip (Total holders, Total currency accounts, per-currency split). Search by name/phone/email/account number/alias. Premium dark table; gold-gradient avatar initials; `StatusBadge`.

**Detail**: header with canonical name, DAHAB account number (mono gold), status. Per-currency totals strip (existing component restyled). Linked accounts as premium cards (currency badge, account #, alias, current balance tabular-nums, status, credit/debit limits, withdraw limit editor for admin, available-to-withdraw, per-account ledger preview). Admin: New holder / Add linked account / Edit profile / Edit withdrawal limit. Auditor: read-only.

## 10. Vaults / Groups / Audit / Users — reskin

- Vaults: cash & bank vault cards w/ per-currency balances; vault detail page with recent ledger entries; admin edit limits/status; auditor read-only.
- Groups: cards/table with description, member count, aggregated balances by currency; admin CRUD; auditor read-only.
- Audit: dark inbox-style log stream with timestamp/actor/action/target, filters, PDF export.
- Users: premium table with name, email, role chips, change-role dropdown, send password reset, change email, "Add Consumer Account" gold CTA → existing `/app/users/new-consumer` page (also restyled to premium card layout).

## 11. Consumer Portal upgrade — `src/routes/portal.tsx`, `portal.$accountId.$currency.tsx`

Same DAHAB dark+gold aesthetic, separate shell (no staff nav), keep existing `owner_user_id = auth.uid()` query (RLS).

- Topbar: `BrandMark`, sign out (ghost button, gold hover), Language + Theme toggles.
- `/portal` overview: premium account cards (alias/name, account #, currency badge, current balance tabular-nums, status, small recent activity preview, "View Ledger" gold link). Mobile-first stack.
- `/portal/:accountId/:currency` ledger: dark-hero balance header (alias, account #, currency badge, current balance huge `font-serif`), paginated transactions w/ running balance, deposit green +, withdraw red −, status badges, PDF download via existing `ExportPdfButton`, back link.

## 12. Mobile teller `/m/*`

- `/m/login`: dark-hero card, gold gradient login button, `BrandMark` vertical layout.
- `/m/dashboard`: compact DAHAB header, currency totals strip (single column), big Quick Deposit / Quick Withdraw tap targets (`h-14`), recent transactions list with same color rules, same pending-approval behavior reusing `post_transaction`.

## 13. Notifications / Security / About — reskin

- Notifications: dark inbox; unread = gold left bar (`shadow-[0_0_10px_rgba(212,168,87,.5)]`); event toggles & thresholds in settings; large transaction alerts; low vault alerts; pending approval reminders; daily summary.
- Security: passkey list (existing data); add/register/delete passkey buttons; sign-out-everywhere.
- About: app version, env, contact, docs.

## 14. Login / forgot/reset/change-password screens

Reskin to mockup `BackofficeLogin.tsx` look: full-bleed dark mesh background; centered `dark-hero` card; vertical `BrandMark`; gold gradient submit; muted helper links.

## 15. Constraints honored

- Don't edit `src/integrations/supabase/{client,types}.ts`, `.env`, or `src/routeTree.gen.ts`.
- No new tables, RPCs, or auth flows. No backend logic changes.
- All admin/teller/auditor/consumer gates preserved via existing `RoleGate` + `requireSupabaseAuth`.
- No loans, credit cards, ATM cards, crypto, investments, bills, external transfers, marketing pages, AI dashboards, generic SaaS widgets.
- Mock data only on isolated demo widgets, never replacing real backend calls; no fake success.
- TypeScript strict — no broken imports; no placeholder pages where real ones exist.

## 16. Files touched (overview)

**Edit**:
`src/styles.css`, `src/components/app/app-shell.tsx`, `src/components/brand/dahab-mark.tsx`, `src/components/app/currency-totals-strip.tsx`, `src/components/app/entry-form.tsx`, `src/components/app/notification-bell.tsx`, `src/components/app/statement-ledger.tsx`,
`src/routes/app.index.tsx`, `src/routes/app.approvals.tsx`, `src/routes/app.transactions.index.tsx`, `src/routes/app.transactions.new.index.tsx`, `src/routes/app.holders.index.tsx`, `src/routes/app.holders.$id.tsx`, `src/routes/app.holders.new.tsx`, `src/routes/app.vaults.index.tsx`, `src/routes/app.vaults.$id.tsx`, `src/routes/app.audit.tsx`, `src/routes/app.users.tsx`, `src/routes/app.users.new-consumer.tsx`, `src/routes/app.settings.notifications.tsx`, `src/routes/app.settings.security.tsx`, `src/routes/app.about.tsx`, `src/routes/app.me.activity.tsx`, `src/routes/app.groups.index.tsx`, `src/routes/app.groups.$id.tsx`,
`src/routes/portal.tsx`, `src/routes/portal.$accountId.$currency.tsx`,
`src/routes/m.login.tsx`, `src/routes/m.dashboard.tsx`,
`src/routes/login.tsx`, `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx`, `src/routes/change-password.tsx`.

**Create**:
`src/routes/app.reports.tsx`,
`src/components/ui/currency-badge.tsx`,
`src/components/ui/status-badge.tsx`,
`src/components/ui/premium-card.tsx`,
`src/components/ui/gold-button.tsx` (variant addon, or extend existing button),
`src/components/app/kpi-card.tsx`,
`src/components/app/section-header.tsx`,
`src/components/app/dashboard-settings-drawer.tsx`,
`src/components/app/pinned-customers.tsx`.

## 17. Implementation order (after approval)

1. Tokens & utilities in `src/styles.css` + force `theme-night` default + ambient mesh.
2. Brand + shared visual primitives (currency badge, status badge, premium card, gold button variants, KPI card, section header).
3. AppShell topbar + sidebar reskin + Reports nav item.
4. Dashboard rebuild (real data only).
5. Reports page (new, real data, with disabled tiles where exports aren't wired).
6. Approvals two-pane reskin.
7. New Transaction wizard + Transactions table reskin.
8. Holders list/detail + Vaults + Groups + Audit + Users + New Consumer.
9. Consumer portal (overview + ledger).
10. Mobile teller (login + dashboard).
11. Notifications / Security / About / Login family.
12. Final polish pass: verify no `bg-white`, no light surfaces, all amounts `tabular-nums`, all page titles `font-serif`, all CTAs use gold gradient, no missing routes, `bun run build` clean.
