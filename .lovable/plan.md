# New Transaction Wizard — MagicPatterns Parity

Rebuild `/app/transactions/new` as a single-page step wizard that visually and structurally matches the MagicPatterns mockup (Section 18 of `DESIGN_SPEC.md` + `pages/NewTransaction.tsx`), while keeping every backend call, role check, and approval rule from the current Lovable app intact.

## Scope

**In scope (UI / flow only):**
- Replace the current two-route entry (`/app/transactions/new/deposit` and `/app/transactions/new/withdraw` rendering `EntryForm`) with one wizard at `/app/transactions/new` driven by `?type=` and an internal step machine.
- Recreate stepper, animated step transitions, sticky bottom action bar, type cards, customer/account search, vault cards, details, review, and full-page result screens.
- Enforce admin-only balance visibility throughout.

**Out of scope (do not touch):**
- Supabase schema, RLS, auth, role tables.
- Existing `holder_cards` search query, post-transaction RPC, approval thresholds, audit triggers.
- Notifications, vault listing, holders pages.
- Internal Transfer (confirmed not supported — only Deposit + Withdraw).

## Routes

- `/app/transactions/new` — the wizard (replaces current chooser).
  - `?type=deposit` → preselect Deposit, jump to Customer step.
  - `?type=withdraw` → preselect Withdraw, jump to Customer step.
  - Invalid/missing → start at Type step.
- `/app/transactions/new/deposit` and `/.../withdraw` → kept as thin redirects to `/app/transactions/new?type=deposit|withdraw` so existing buttons/links keep working.
- All existing entry points (dashboard "New transaction", deposit/withdraw shortcuts) continue to work without edits to those callers.

## Step machine

Single component `NewTransactionWizard` with state:

```
{ stepIdx, type, selectedAccount, vaultSide, amount, comment, valueDate,
  attachments, isSubmitting, result, txnId }
```

Steps (keys): `type` → `customer` → `vault` → `details` → `review`.

Cascade resets:
- type change → clears account, vault, amount, comment, attachments, result.
- account change → clears vault, amount, comment, result.
- vault change → clears amount/comment/result downstream only if needed.

`canContinue()`, `next()`, `back()`, `goToStep()` (backward-only) implemented per spec. Review's primary button becomes "Confirm & Submit".

## Step UIs

1. **Type** — two premium selectable cards (Deposit `ArrowDownRight`, Withdraw `ArrowUpRight`) with gold border + glow when active, check badge top-right.
2. **Customer / Account** — reuses the existing `holder_cards` search query already in `entry-form.tsx`; result list rebuilt as stacked dark cards (name, DAHAB#, account#, currency badge, status, withdrawal limit, phone). Selected account confirmed via gold-glow card with "Change" button. Mobile-first single column, responsive grid on lg.
3. **Vault** — two cards: Cash Vault (`Wallet`), Bank Vault (`Landmark`); active state gold border + glow. Wired to existing internal vault selection logic from current entry form.
4. **Details** — large Playfair amount input with currency suffix + quick chips, comment textarea, optional value date. Admin-only balance preview (current + after). Non-admin sees withdrawal limit only and a generic "requires admin review" notice when overdrawn or > 25k. Approval-required amber callout uses existing `willPend` logic.
5. **Review** — hero amount card with signed amount (emerald `+` for deposit, red `−` for withdraw), amber approval callout if `willPend`, detail rows with inline Edit icons that `goToStep()` back, compliance footnote. No balances for non-admins.

## Stepper + transitions

- Horizontal stepper (5 nodes): completed = gold filled + check, active = gold ring/text, future = muted. Connector lines animate to gold on completion.
- Step body wrapped in `framer-motion` `AnimatePresence mode="wait"` with `initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}}` (~0.25s). `framer-motion` is already installed.
- Mobile: compact stepper (numbered dots + active label only) — no overflow.

## Sticky action bar

Fixed bottom, `bg-card/95 backdrop-blur-md border-t border-gold/15 z-20`. Inner `max-w-4xl mx-auto px-4 md:px-8 py-4`. Page wrapper gets `pb-32`. Left = Cancel (step 1) / Back. Right = Continue / "Confirm & Submit" (review). Disabled + spinner during submit.

## Submit + result screens

- Submit calls the **existing** transaction posting code path used today by `EntryForm` (no backend change). Returns success or pending based on existing approval logic.
- After submit, replace toast with full-page result screen rendered inside the wizard (terminal state):
  - **Success** — emerald check, "Transaction Complete", receipt card (txn id, type, amount, customer, account, vault, value date, comment, status). Actions: Back to Dashboard / View Transactions / New Transaction (resets state, no reload).
  - **Pending Approval** — amber clock, "Awaiting Approval", same receipt + Pending Review status badge.
  - **Failed** — red icon if backend throws; shows safe error message + Try Again / Back to Transactions.
- Submit button guarded against duplicate submission.

## Balance privacy

Reuse existing `canViewBalances = hasAnyRole(roles, ["admin"])`. Apply gate everywhere balance text could render in the new wizard (search results, selected card, details preview, review hero, receipt). Withdrawal limit + status remain visible to all.

## Files

**Replace / heavily edit:**
- `src/components/app/entry-form.tsx` → renamed conceptually into `src/components/app/new-transaction-wizard.tsx` (new file). Keeps the existing query and submit hooks copied from current entry form.
- `src/routes/app.transactions.new.index.tsx` → renders `<NewTransactionWizard />` with zod-validated `?type` search param.
- `src/routes/app.transactions.new.deposit.tsx` and `.withdraw.tsx` → redirect to `/app/transactions/new?type=…` (preserves existing deep links).

**Add:**
- `src/components/app/wizard/Stepper.tsx`
- `src/components/app/wizard/StickyActionBar.tsx`
- `src/components/app/wizard/steps/TypeStep.tsx`, `CustomerStep.tsx`, `VaultStep.tsx`, `DetailsStep.tsx`, `ReviewStep.tsx`, `ResultStep.tsx`

**Delete:**
- Old `src/components/app/entry-form.tsx` after the new wizard is wired up (its query/submit logic is migrated, not duplicated).

## Risks / guardrails

- All Supabase calls and approval thresholds are copy-moved from `entry-form.tsx`, not rewritten — same RPC, same payload shape.
- Roles read via existing `useAuth()` + `hasAnyRole`.
- Build is strict: every new file lands with its imports, and `framer-motion` import already present in project.
- No changes to `routeTree.gen.ts`; new component files under `src/components/app/wizard/` won't affect routing.
