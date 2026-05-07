# Withdrawal limits + admin user management + approval queue

Three related changes: per-currency withdrawal limits on holder accounts, expanded admin tools for users (with a dedicated consumer-creation page), and an approval queue for over-limit / insufficient-balance withdrawals — including partial approvals.

---

## Part A — Withdrawal limits (per holder account, per currency)

Limits stored on each `holder_accounts` row and always interpreted in that account's own `currency_code`. No shared cross-currency limit.

### A1. Schema migration
Add to `public.holder_accounts`:
- `withdraw_limit_enabled boolean NOT NULL DEFAULT false`
- `withdraw_limit_amount numeric NOT NULL DEFAULT 0` (CHECK >= 0)

New `public.holder_account_limit_events` (audit): id, holder_account_id, actor_user_id, changed_at, prev/new enabled, prev/new amount, note. RLS: SELECT for staff; inserts only via SECURITY DEFINER RPC.

New view `public.v_holder_account_withdraw_limits`:
```sql
SELECT id AS holder_account_id, account_number, currency_code, current_balance,
       withdraw_limit_enabled, withdraw_limit_amount,
       (current_balance + CASE WHEN withdraw_limit_enabled THEN withdraw_limit_amount ELSE 0 END)
         AS available_to_withdraw
FROM public.holder_accounts;
```

### A2. Database functions
- `sp_set_holder_withdraw_limit(p_holder_account_id, p_enabled, p_amount, p_note)` — admin only.
- `sp_validate_holder_withdrawal(p_holder_account_id, p_amount)` returns `(can_withdraw, available_to_withdraw, reject_reason, requires_review, review_reason)`.

### A3. Admin holder detail (`src/routes/app.holders.$id.tsx`)
"Set Withdrawal Limit" card (admin-only): Switch enabled, amount with currency suffix, note. Each account card shows account #, currency, balance, limit enabled, limit amount, **available to withdraw** (in account's own currency). Add "Limit history" collapsible.

### A4. Teller withdrawal (`src/components/app/entry-form.tsx`)
Show available-to-withdraw prominently. When `amount > available_to_withdraw`, do NOT hard-block — show amber inline notice (see Part C) and route to approval queue.

---

## Part B — Admin Users (`src/routes/app.users.tsx`) + Add-Consumer page

### B1. Show connected email per user
Surface `auth.users.email` in a dedicated column for every row.

### B2. Admin can change user email
SECURITY DEFINER RPC `public.admin_change_user_email(p_target_user uuid, p_new_email text)` — admin-gated, validates uniqueness, updates `auth.users.email`, sets `email_confirmed_at = now()`, audit-logs `user.email_change`. UI: row action → dialog with new-email input + confirm.

### B3. Dedicated "Add consumer account" page
Instead of an inline dialog, create a full page **`src/routes/app.users.new-consumer.tsx`** (admin-only via `RoleGate`).

- Users page gets an "Add consumer account" button that navigates to `/app/users/new-consumer`.
- Page layout uses `PageHeader` and a single Card with a form:
  - Full name
  - Email
  - Temporary password (with "Generate" helper button)
  - Multi-select picker of holder accounts to link (searchable by holder name / DAHAB # / account number)
  - Submit + Cancel (returns to `/app/users`)
- On submit, POST to new server route **`src/routes/api/admin/consumer-accounts.ts`** using `supabaseAdmin`:
  - Verifies caller is admin via bearer + `has_role`.
  - `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`.
  - Sets `profiles.must_change_password = true` so consumer must change password on first login.
  - Inserts `user_roles` row with role `consumer`.
  - For each picked holder: sets `account_holders.owner_user_id = <new user>`.
  - Audit-logs `consumer.create` with linked holder ids.
- On success, toast + navigate back to `/app/users` (which refetches).

### B4. Link/unlink holder ↔ consumer (post-creation)
On the Users list, consumer rows get a "Linked holders" expandable showing `account_holders` where `owner_user_id = user.id`, plus an inline "Add link" picker and "Unlink" button. Backed by admin RPC `public.admin_set_holder_owner(p_holder_id bigint, p_owner uuid|null)` — admin-only, audit logged.

### B5. Future-readiness
Plan documents that consumer self-signup will be added later (admin only approves the holder link). For now only the admin-driven path exists.

---

## Part C — Approval queue (over-limit / insufficient + partial approvals)

Withdrawals that fail the validator are NOT hard-rejected at submission — they are created as `status='pending'` with a structured review reason and routed to `/app/approvals`. Admins can approve as-is, reject, or **approve a partial amount**.

### C1. Validator output
`sp_validate_holder_withdrawal` returns:
- `can_withdraw boolean` — amount ≤ available_to_withdraw.
- `available_to_withdraw numeric`.
- `requires_review boolean` — true when `can_withdraw` is false (and amount > 0).
- `review_reason text` ∈ `('insufficient_balance', 'exceeds_withdraw_limit', 'over_limit_with_buffer')`.
- `reject_reason text` only for hard rejects (amount ≤ 0, account inactive).

### C2. `transactions` schema additions (migration)
- `review_reason text` (nullable) — populated when row is queued for review.
- `requested_amount_minor bigint` (nullable) — original amount the teller requested; `amount_minor` will hold the actually-approved amount after partial approval.
- `partial_approved boolean NOT NULL DEFAULT false`.

### C3. `post_transaction` hook (withdraw direction)
1. Call validator.
2. If `reject_reason` → `RAISE EXCEPTION` (hard reject, no row).
3. Insert `transactions`:
   - `requested_amount_minor = amount_minor` (always).
   - If `can_withdraw` → `status='posted'` as today.
   - If `requires_review` → `status='pending'`, `review_reason=...`, ledger entries deferred until approval.
4. Insert admin `notifications` (`pending_created`, severity warning) with `review_reason` in `data`.

### C4. Approve / reject RPCs
- `approve_transaction(p_tx_id, p_approved_amount_minor numeric DEFAULT NULL)`:
  - Admin-only.
  - If `p_approved_amount_minor` is NULL → approve full requested amount.
  - Else validate `0 < p_approved_amount_minor <= requested_amount_minor` and set `amount_minor = p_approved_amount_minor`, `partial_approved = true`.
  - Re-run `sp_validate_holder_withdrawal(account, approved_amount)`. If still over limit, allow with audit override (`tx.override_approve` with original `review_reason`).
  - Post ledger entries for the approved amount, set `status='posted'`, `approved_by_user_id`, `posted_at`.
  - Audit-log `tx.partial_approve` when partial, otherwise `tx.approve`.
- `reject_transaction` unchanged.

### C5. Approvals page (`src/routes/app.approvals.tsx`)
Per pending row:
- `Badge` for `review_reason`:
  - `insufficient_balance` → red "Insufficient balance"
  - `exceeds_withdraw_limit` → red "Over withdrawal limit"
  - `over_limit_with_buffer` → amber "Within buffer — review"
- Show requested amount, current balance, available-to-withdraw, withdrawal limit.
- Row actions:
  - **Approve full** → calls `approve_transaction(id, NULL)`.
  - **Approve partial…** → opens dialog with amount input (defaults to `available_to_withdraw` if it's > 0 and < requested, else to requested). Validates `0 < input ≤ requested`. Shows the resulting post-transaction balance preview. Confirm → `approve_transaction(id, partial)`.
  - **Reject** → existing reason dialog.
- After partial approval, the transaction shows badge "Partially approved — X of Y" in transaction lists.

### C6. Teller submit UX (`entry-form.tsx`)
When `amount > available_to_withdraw`:
- Replace previous block with amber inline notice: *"This withdrawal exceeds available funds and will be queued for admin approval — `<reason>`. The admin may approve a smaller amount."*
- Submit button label → "Submit for approval".
- On success → toast "Sent to approvals".

### C7. Notifications
Reuse `pending_created`; include `review_reason` and `requested_amount_minor` in `notifications.data`.

---

## Files touched

- New `supabase/migrations/<ts>_withdraw_limits_and_approval_queue.sql` — schema, view, validator, `post_transaction` patch, `transactions.review_reason` + `requested_amount_minor` + `partial_approved`, `approve_transaction` (partial-aware), `admin_change_user_email`, `admin_set_holder_owner`
- New `src/routes/app.users.new-consumer.tsx` — dedicated add-consumer page
- New `src/routes/api/admin/consumer-accounts.ts` — POST handler
- Edit `src/routes/app.holders.$id.tsx` — limit card + available-to-withdraw display
- Edit `src/components/app/entry-form.tsx` — available-to-withdraw display + queued-for-approval UX
- Edit `src/routes/app.approvals.tsx` — review-reason badges, balance/limit context, partial-approve dialog
- Edit `src/routes/app.users.tsx` — email column, change-email dialog, "Add consumer account" link, linked-holders panel
- Edit `src/routes/app.transactions.index.tsx` — show "Partially approved" badge
- Edit `src/lib/dahabApi.ts` — withdraw-limit, withdraw, admin user, partial-approve wrappers
- Edit `docs/ARCHITECTURE.md` — withdrawal limits, approval queue (incl. partial approvals), admin user management

## Out of scope
- Cross-currency aggregate limits
- Consumer self-signup
- Email verification flow for changed email (admin-trusted, marked confirmed)
- Multi-step / quorum approvals
