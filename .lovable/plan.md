# Credit limit + Balance limit refactor

Replace the current `debit_limit` / `credit_limit` / `withdraw_limit_amount` / `withdraw_limit_enabled` model with two explicit, backend-enforced concepts:

- **Balance limit** — protected minimum customer balance.
- **Credit limit** — revolving extra withdrawal capacity, tracked via `credit_used`.

Backend is the source of truth. UI only renders derived values and disabled states.

---

## Open questions (need your decision before I implement)

1. **Deposit policy** — when a customer deposits while `credit_used > 0`:
   - **A) Auto-repay-first** (recommended): deposit reduces `credit_used` first, remainder increases balance.
   - **B) Separate repayment**: deposit always increases balance; credit is repaid only via a dedicated "Repay credit" action.

2. **Migration of existing data** — today the `holder_accounts` table has `credit_limit`, `debit_limit`, `withdraw_limit_amount`, `withdraw_limit_enabled`. Which mapping do you want?
   - **A) Treat current `debit_limit` as the new `balance_limit`** and keep `credit_limit` as the new `credit_limit`. Drop `withdraw_limit_*` (or alias to `balance_limit` if enabled).
   - **B) Treat `withdraw_limit_amount` (when enabled) as the new `balance_limit`** and keep `credit_limit`. Drop `debit_limit`.
   - **C) Start everything at zero** and let admins re-enter limits.

3. **Scope of "account"** — should this apply to:
   - **only `holder_accounts`** (per-currency customer accounts shown on `/app/accounts/$id` and `/app/holders/$id`), OR
   - **also `accounts` + `account_balances`** (the older ledger model in the `accounts` table)?

   I recommend **holder_accounts only** since that's where the limit UI lives today.

---

## What changes

### Database (migration)

On `holder_accounts`:
- Add `balance_limit numeric(20,2) not null default 0`.
- Add `credit_used numeric(20,2) not null default 0`.
- Keep `credit_limit` (semantics unchanged).
- Backfill `balance_limit` per chosen mapping (Q2).
- Drop or deprecate `debit_limit`, `withdraw_limit_amount`, `withdraw_limit_enabled` (kept as nullable aliases for one release if you prefer a soft cutover — say which).
- Add CHECK-equivalent triggers: `balance_limit >= 0`, `credit_limit >= 0`, `credit_used >= 0`.

New SQL function `sp_account_limits(account_id)` returning derived fields:
`balance, balance_limit, credit_limit, credit_used, spendable_balance, available_credit, available_to_withdraw, over_limit`.

Update `sp_set_holder_withdraw_limit` → replaced by `sp_set_account_limits(account_id, balance_limit, credit_limit)` (admin-only via existing RLS).

Update the withdrawal posting procedure to:
1. Re-compute `available_to_withdraw` server-side.
2. Reject if `amount > available_to_withdraw` or `over_limit`.
3. Consume spendable balance first, then credit.
4. Increment `credit_used` by the credit-funded portion.
5. Persist split (`from_balance_minor`, `from_credit_minor`) on the ledger entry for audit.

For deposits, apply the chosen policy (Q1).

### Backend API (TanStack server functions)

Add server functions in `src/lib/api/accounts.ts` (or a new `src/lib/api/limits.functions.ts`):
- `getAccountLimits(accountId)` → derived snapshot.
- `setAccountLimits(accountId, { balance_limit, credit_limit })` — admin-only.
- `quoteWithdrawal(accountId, amount)` → `{ from_balance, from_credit, available_to_withdraw_after, blocked, reason }`.
- Existing withdrawal commit path calls the new server validation; never trusts client.
- Optional `repayCredit(accountId, amount)` if you pick deposit policy B.

### Frontend

**`src/routes/app.accounts.$id.tsx`** (and the equivalent card on `app.holders.$id.tsx`):
- Remove the existing "Withdraw limit" + old "Credit/Debit limits" cards.
- Replace with one **Limits** card with two inputs:
  - **Credit limit** — helper: "Extra amount this customer can withdraw beyond spendable balance."
  - **Balance limit** — helper: "Minimum balance to protect before credit is used."
- Below it, a read-only **Summary** showing: Current balance, Balance limit, Spendable balance, Credit limit, Credit used, Available credit, **Available to withdraw**.
- Save / Cancel; save disabled while invalid; success toast; refresh summary on save.
- Inline validation: non-negative numbers, currency precision matches account.

**`src/components/app/new-transaction-wizard.tsx`**:
- Replace `withdraw_limit_*` plumbing with `available_to_withdraw` from the new quote endpoint.
- On amount change → call `quoteWithdrawal` (debounced).
- Show split preview "From balance: X · From credit: Y".
- Disable Submit when amount empty, ≤ 0, > `available_to_withdraw`, or account over limit; show precise error copy.
- Keep approval/pending flow unchanged.

**i18n**: update `src/lib/i18n/en.ts` + `ar.ts` — remove "debit limit" / "withdraw limit" keys; add `creditLimit`, `balanceLimit`, `spendableBalance`, `availableCredit`, `creditUsed`, `availableToWithdraw`, helper copy, error messages.

**Other UI touchpoints** (label-only updates, no logic change): `app.approvals.tsx`, `app.accounts.index.tsx`, `app.holders.$id.tsx` listings.

### Docs
- Update `docs/DATABASE_CONTRACT.md`, `docs/API_CONTRACT.md`, `docs/DATA_INTEGRITY_RULES.md`, `docs/backend/openapi.yaml` to reflect the new fields, endpoints, and rules.

---

## Acceptance criteria

- No "debit limit" / "withdraw limit" copy remains in the staff UI.
- Only **Credit limit** and **Balance limit** are editable on the account page.
- Backend returns `spendable_balance`, `available_credit`, `available_to_withdraw`.
- Withdrawal of `> available_to_withdraw` is blocked **server-side**, with a clear reason.
- Mixed withdrawals correctly split balance vs credit and bump `credit_used`.
- Deposits behave per the chosen policy (Q1).
- Existing accounts migrate without losing balances or breaking historical transactions.
- Admin-only edit of limits enforced via existing `holder_accounts admin write` RLS.
- No service-role keys exposed to the browser.

---

## Suggested rollout (small, testable blocks)

1. **Migration + read API** — add fields, backfill, expose `getAccountLimits`. UI still reads old fields.
2. **Limits editor UI** — new card on account page, calls `setAccountLimits`. Old card hidden.
3. **Withdrawal quote + enforcement** — `quoteWithdrawal` + server-side enforcement in posting procedure; wizard wired to quote.
4. **Deposit policy** (A or B).
5. **Cleanup** — drop deprecated columns, remove old i18n keys, refresh docs.

Each step is independently shippable and revertable on the frontend; only step 1 and step 5 touch schema.

---

**Please answer Q1, Q2, and Q3 and confirm the rollout order, then I'll implement step 1 first.**
