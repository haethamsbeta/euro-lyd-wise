## Goal

On desktop (`lg:`+) only, move the **Pinned Customers** card out of the right column and place it as a **full-width row directly under the Cash/Bank vault boxes**. Phone and tablet layouts stay exactly as they are.

## Current state

- On `lg:`, Pinned Customers lives in the right column (`lg:col-span-5`) above Urgent Approvals. It looks like a narrow squeezed card.
- On phone/tablet, it stacks naturally in the single column — that's correct and untouched.

## Change

In `src/routes/app.index.tsx` `AdminDashboard`:

1. Render `PinnedCustomers` **twice**, gated by breakpoint (same pattern already used for `HoldingsSummary`):
   - Mobile/tablet: existing position in the right column, wrapped in `lg:hidden`. No visual change below `lg`.
   - Desktop: a new full-width slot inside the left column (`lg:col-span-7`) immediately under the Cash/Bank vault grid, wrapped in `hidden lg:block`. Since the left column already holds Vaults + Holdings on desktop, the new order becomes: Vaults → Pinned Customers → Holdings.

2. Result on desktop: Pinned Customers spans the same width as the vault grid above it (the full left column = 7/12 of the page width). Right column on desktop becomes Urgent Approvals only.

## Out of scope

- Phone & tablet layouts (every change is `lg:` / `hidden lg:block` gated).
- Bottom dock visibility.
- Pinned Customers component internals, data, or behavior.
- Any other widget, page, or route.

## Acceptance check

- 1536×864 desktop: Pinned Customers sits as a wide card directly below the two vault boxes, matching their combined width. Right column shows only Urgent Approvals.
- 390×844 phone & 820×1180 tablet: pixel-identical to current build.
