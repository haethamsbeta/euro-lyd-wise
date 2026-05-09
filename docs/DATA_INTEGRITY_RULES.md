# DAHAB — Data Integrity Rules

These rules MUST be enforced server-side (DB constraints + stored procedures
+ RLS). Frontend validation is only a convenience.

## Holders & accounts
1. One `account_holders` row → many `holder_accounts`, one per
   `(currency_code, account_nature)` combination is typical but not unique-enforced
   (a holder may have two USD accounts of different display names).
2. `currency_code` ∈ `('USD','EUR','LYD')`. Adding GBP requires an enum
   migration + `currencies` row + UI release.
3. `holder_accounts.account_number` is unique within a holder.
4. `holder_accounts.dahab_account_number` is denormalized from
   `account_holders.dahab_account_number` for fast search; must not drift.

## Ledger & balances
5. `ledger_entries`: each `transaction_id` has **exactly two rows**, one
   `debit` and one `credit`, with equal `amount_minor` and matching `currency`.
6. `holder_ledger_entries.balance_after` is the running balance at the time
   the row was inserted and **must not be recalculated retroactively**.
7. `account_balances.balance_minor` reflects the sum of all signed ledger
   entries for that `(account_id, currency)`. Maintained by `apply_ledger()`.
8. Money is stored in BIGINT minor units. No FLOAT/DOUBLE for monetary fields.

## Transactions
9. `transactions` rows are **immutable** except for the narrow status
   transitions performed by `approve_transaction`, `reject_transaction`,
   `correct_transaction`. Direct UPDATE is denied.
10. Allowed status transitions:
    - `pending → posted` (approve)
    - `pending → rejected` (reject)
    - `posted  → reversed` (correct, via reversal entry)
    - No other transitions allowed.
11. Posted transactions are NEVER edited in place — corrections are a
    reversal + a new posted entry, both audited.
12. Pending transactions require explicit approval by an `admin`.
13. `requested_amount_minor` preserves the original ask when a partial
    approval changes `amount_minor`.
14. `branch_id` is filled by the trigger from the creator's profile —
    the API must not pass it explicitly.

## Deposits / withdrawals
15. Deposit: `customer.credit += amount`, `vault.debit += amount`.
16. Withdraw: `customer.debit += amount`, `vault.credit += amount`.
17. Withdraws above `holder_accounts.withdraw_limit_amount` (when enabled)
    must be forced into `pending` by `post_transaction`.
18. Vault must exist for the requested `(channel, currency)`. Otherwise
    `post_transaction` raises.

## Reports & currency
19. Reports must NEVER sum across currencies unless they consult
    `fx_rates_current`. The only consolidated USD figure in the app is
    produced by `report_consolidated_usd()`.
20. Currencies missing from `fx_rates_current` appear in `missing_rates`
    and are excluded from the total — never silently zeroed in.

## Audit
21. `audit_log` is append-only — no UPDATE, no DELETE granted.
22. Every financial mutation (`tx.post`, `tx.reject`, `tx.reverse`,
    `tx.correct`, `withdraw_limit.update`, `holder.create`, `role.grant`,
    `role.revoke`, `fx_rate.create`, `branch.create/update`,
    `user.email_change`, `user.password_reset`) must write an `audit_log` row.

## Customer portal
23. The portal user can only see rows where the `account_holders.owner_user_id`
    (or `accounts.owner_user_id`) chain equals the authenticated `auth.uid()`.
24. Statement queries on the portal must enforce both `customer_account_id`
    AND `currency` filters server-side.

## Roles
25. Roles live in `user_roles` only — never on `profiles` or any business
    table. Role checks always use `has_role()` / `is_staff()`.
26. A user may have multiple roles (admin + auditor combinations are valid).

## Deletes
27. DELETE is forbidden on `transactions`, `ledger_entries`, `audit_log`,
    `holder_ledger_entries`, `holder_account_limit_events`. Use status
    changes / reversals instead.
