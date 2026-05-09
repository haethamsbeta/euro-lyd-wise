## Goal

Redesign the Transactions module to match the Magic Patterns DAHAB mockup (premium dark + gold theme, Playfair display, KPI strip, status-rich rows, full detail page, polished wizard) while keeping every existing search, filter, edit, attachment, reversal and approval feature working against the current Supabase data model.

## Scope (3 files)

### 1. `src/routes/app.transactions.index.tsx` (rewrite presentation, keep logic)

Keep as-is (no behavior change):
- Supabase query (`transactions.list.v2` + `transactions.dahabmap`)
- Search debounce, status / direction / date / files-only filters
- `?q=` and `?focus=` URL sync
- Edit dialog, reverse, approve/reject, attachments — all current mutations and dialogs
- Role gating (admin / teller / auditor)
- Existing exports (`ExportPdfButton`, `describeTx`)

Replace presentation with mockup layout:
- Header row: H1 "Transactions" (Playfair) + subtitle, right side `[Export]` secondary + `[+ New Transaction]` primary gold gradient button
- KPI strip: 4 motion cards (Today / Pending / Completed / Failed) computed from current rows, clickable to set `statusFilter`
- Quick-filter chip row (All / Today / Pending only / Over 25k / Cash / Bank / Deposits / Withdrawals) wired to existing filters
- Toolbar Card: search input (gold focus ring), currency + direction selects, filter icon
- Table Card: gold-hairline premium card, uppercase tracked thead, hover gold rows, motion stagger, amount cell colored ±, `CurrencyBadge` + `StatusBadge` reused
- Row click → navigate to `/app/transactions/$id` (new route below) instead of opening side sheet; keep edit dialog accessible from detail page

### 2. NEW `src/routes/app.transactions.$id.tsx`

Detail page per spec:
- Breadcrumb `← Transactions / TXN-####`
- Hero premium card: ID + StatusBadge + kind chip, big Playfair amount with sign + CurrencyBadge, action cluster (Approve/Reject when pending; Reverse/Download when posted; Retry when failed; Read-Only chip for auditor)
- Left col: Status Timeline card (Initiated → Pending → Approved/Rejected → Completed with animated active halo), Audit Trail card from existing audit log query
- Right col: From/To tile pair with center arrow disc, Amount Details card (amount/fee/total), Compliance & Documentation card (existing attachments), Reference Information card (description + internal notes)
- Hooks reuse existing approve/reject/reverse mutations extracted from current list page

### 3. `src/components/app/new-transaction-wizard.tsx` (visual polish only)

Keep all existing step logic, validation, submit flow, deep-link `?type=`. Apply mockup styling pass:
- Sticky stepper + context pill row with gold rings/halos
- Step 1 type cards: emerald/red toned, keyboard D/W
- Step 2 customer search + AccountTile grid with currency-colored top border
- Step 3 vault cards (Cash gold / Bank sky)
- Step 4 calculator hero (huge Playfair amount input, quick-amount chips, balance preview tiles, animated approval warning)
- Step 5 review with hero amount + ReviewRow list + certify footer
- Fixed bottom action bar
- Result screen replaces wizard on success (spring-in disc, receipt card with serrated bottom edge, action buttons)

## Shared primitives (reuse / extend existing)

- `PremiumCard` (already exists, `variant="premium"`)
- `StatusBadge`, `CurrencyBadge` (already exist) — extend StatusBadge to map "completed/posted/approved" → success, "pending" → warning, "rejected/failed/reversed" → destructive
- New tiny helper: `KpiTile` extracted from current inline KPI

## Out of scope

- No DB schema changes
- No new mutations beyond what already exists
- No changes to deposit/withdraw shortcut routes (`app.transactions.new.deposit.tsx`, `.withdraw.tsx`) — they already delegate to the wizard

## Technical notes

- All colors via existing CSS tokens in `src/styles.css` (`--gold`, `--surface`, `--success`, etc.) — no hardcoded hex in components
- `framer-motion` is already a dependency
- Row navigation switches from in-page Sheet to dedicated route; the Sheet code is removed from list and the equivalent info lives on the detail page
- Currency formatter stays `formatMinor` from `src/lib/format.ts`