## Changes to `src/routes/app.vaults.index.tsx`

### 1. Restore per-account vault cards, grouped visually by currency
Revert the grouped-into-one-card change. Show all 10 official vault accounts again, but render them in sections per currency instead of one flat grid.

- Group `vaults` by `currency_code` (preserve backend order; "Currency missing" goes last).
- For each currency, render a section:
  - Subheading row: currency code + count (e.g. "LYD · 3 accounts").
  - A grid (`md:grid-cols-2 xl:grid-cols-3`) containing one card per individual vault account in that currency — same card markup as before the grouping change (icon, name, role label "Cash Receivable / Cash Payable / Vault", channel, currency badge, balance, "view transactions" link to `/app/vaults/$id`).
- Sections render in sequence so receivable + payable for the same currency are always adjacent.

### 2. Make Currency Cash Vault Summary cards clickable
The top strip `cashByCurrency.map(...)` currently renders plain `<Card>`. Wrap each card in an anchor that scrolls to the matching currency section below.

- Give each currency section a stable `id` like `vault-ccy-LYD`.
- Wrap the summary card in `<a href="#vault-ccy-${ccy}">` with `scroll-mt-24` on the section anchor target so the sticky header doesn't cover it.
- Add hover styling consistent with the existing vault cards (`hover:border-gold/50 hover:shadow-lg cursor-pointer`).

No backend, adapter, query, or detail-page changes. No FX math.

### Verification
- Typecheck.
- All 10 vault accounts visible again.
- Receivable/Payable for same currency appear under one currency heading.
- Clicking a Currency Cash Vault Summary card jumps to that currency's section.
