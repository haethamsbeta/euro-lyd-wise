## Goal

Improve only `src/routes/app.groups.index.tsx` (the Groups landing page). Keep the group detail page and any other flow pages untouched. Make balances visually dominant and surface more at-a-glance signals useful for admins/auditors monitoring groups.

## Scope

- File touched: `src/routes/app.groups.index.tsx` only.
- No schema, query, route, or business-logic changes — same data already fetched (`balancesQ`, `activityQ`, `membersQ`).

## Changes to the Group Card (`GroupCard`)

Make balances the visual anchor of each card:

1. **Primary balance hero**
   - Replace the small "Balances · 30d Activity" header + tiny rows with a hero balance block.
   - Show the top currency balance in a large display: `text-2xl md:text-3xl` font-playfair, tabular-nums, with a clearly labeled currency chip beside it (e.g. `LYD`).
   - Below it, a "Total balance" eyebrow label so meaning is obvious.

2. **Secondary currencies row**
   - Up to 2 additional currencies under the hero in `text-base` font-mono tabular-nums (was `text-[11px]`), each with its currency chip.
   - Overflow indicator (`+ N more`) kept but slightly larger (`text-xs`).

3. **30-day activity strip**
   - Move the credits/debits 30d numbers into a dedicated 2-column strip below the balances: green ▲ Credits and red ▼ Debits, each with `text-sm` value and a small label. Include the 30d tx count.
   - This gives auditors flow signals without hunting.

4. **Status / health chips** (auditor-oriented, all derived from existing data)
   - Account count chip (already shown faintly — promote to a visible chip).
   - "No activity 30d" warning chip when `tx30d === 0` across all currencies.
   - "Negative balance" warning chip when any currency aggregate balance < 0.
   - Pinned chip stays.

5. **Card layout polish**
   - Slightly larger card padding on md+ for the new content.
   - Keep the cursor-pointer / hover behavior, type pill, member avatars row, dropdown menu, pin star, and routing exactly as is.

## Changes to KPI strip (top of page)

Light improvement so the page header is more informative without redesigning:

- Add a small breakdown line under "Total Members" showing `acct_count` accounts (sum of `aggregateGroup` account counts) — uses already-fetched data.
- `ManagedBalanceKpi` remains; ensure secondary currencies line is more readable (`text-xs` instead of `text-[11px]`).

## Non-goals

- Do NOT modify the group detail page (`app.groups.$id.tsx`), modals (`GroupModal`), or any flow elsewhere.
- Do not change queries, sorting, filtering, permissions, or the consumer/auditor read-only behavior.
- Do not introduce new dependencies.

## Acceptance check

- Group card balance value is visibly larger (≥ `text-2xl`) and dominates the card.
- Auditors can see, per group: total balance (top currency), additional currencies, 30d credits/debits/tx count, account count, and warnings for stale/negative state — all without clicking in.
- All other Groups-flow pages render identically to before.
