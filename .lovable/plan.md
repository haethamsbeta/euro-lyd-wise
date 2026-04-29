
# Financial Services Web App — v1 Plan

A small-bank style application with two audiences:
- **Internal staff** (admin, teller, auditor) running operations
- **Customers (consumers)** viewing their own ledger

Built on Lovable Cloud (Postgres + Auth). Existing SQL DB integration is deferred.

---

## 1. Roles & Access

- **Admin** — manages users, accounts, vaults, debit limits; approves overdrafts and over-limit debits.
- **Teller / Employee** — posts deposits and withdrawals via the entry flow; cannot approve over-limit/overdraft.
- **Auditor** — read-only access to all ledger entries, accounts, reports, and teller activity logs.
- **Consumer** — sees only their own accounts and ledger.

Roles stored in a dedicated `user_roles` table with a `has_role()` security-definer function powering RLS.

---

## 2. Account Model — Label-Driven

Every account carries a `nature` label: **credit** or **debit**. The posting engine reads this label — no hardcoded sides — so future imports from your existing SQL DB plug in cleanly.

### Account types
- **Customer accounts** — labelled `credit` (balance grows on credit). Hold three currency balances: USD, EUR, LYD.
- **Vault accounts** — always `debit` (balance grows on debit). Two channels per currency:
  - **Cash vaults**: Cash-USD, Cash-EUR, Cash-LYD
  - **Bank vaults**: Bank-USD, Bank-EUR, Bank-LYD
  - Six vaults total.

### Posting rule
For each leg the engine receives an account + side (debit/credit) + amount:
- If `account.nature == side` → balance increases.
- If `account.nature != side` → balance decreases.

Examples:
- **Cash deposit 100 USD**: customer (credit-nature) credited +100 → up. Cash-USD vault (debit-nature) debited +100 → up.
- **Bank withdrawal 100 USD**: customer debited −100 → down. Bank-USD vault credited −100 → down.

### Per-account debit limits
Admin sets a max single-debit amount per customer account per currency. Withdrawals over the limit need admin approval even if funds exist.

### Invariant (per currency)
`Cash-vault + Bank-vault = sum of customer balances` — verified on every post and visible on the dashboard.

No FX/exchange in v1.

---

## 3. Teller Entry Flow — Two Steps

The teller picks the transaction type **before** seeing the entry form. This keeps the interface unambiguous and reduces miskeyed direction errors.

### Step 1 — Choose transaction type (`/app/transactions/new`)

A clean landing screen with two large, color-coded cards. Nothing else. The teller cannot proceed without picking one.

```text
┌────────────────────────────────────────────────────────────┐
│  New Transaction                                           │
│  Choose the type of transaction you want to post.          │
│                                                            │
│  ┌──────────────────────┐    ┌──────────────────────────┐  │
│  │      ↓ DEPOSIT       │    │      ↑ WITHDRAWAL        │  │
│  │                      │    │                          │  │
│  │  Add money to a      │    │  Take money out of a     │  │
│  │  customer account    │    │  customer account        │  │
│  │                      │    │                          │  │
│  │   (green card)       │    │   (red card)             │  │
│  └──────────────────────┘    └──────────────────────────┘  │
│                                                            │
│  Press D for Deposit · W for Withdrawal                    │
└────────────────────────────────────────────────────────────┘
```

Selecting a card routes to:
- `/app/transactions/new/deposit`
- `/app/transactions/new/withdraw`

The chosen direction is locked on the next screen — no toggle. To change, the teller clicks **Back** to return to step 1.

### Step 2 — Entry form

Header makes the chosen direction unmistakable: a colored banner at the top ("DEPOSIT" green / "WITHDRAWAL" red) with a Back link.

```text
┌──────────────────────────────────────────────────────────────┐
│  ← Back   ↓ DEPOSIT (green banner)         Entry # TX-000128 │
├──────────────────────────────────────────────────────────────┤
│  Channel    [ Cash ]    [ Bank ]                             │
│                                                              │
│  Customer account                                            │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ 🔍 Search by name, account #, phone, ID…             │    │
│  │   ▸ ACME Trading        #10042   USD 12,450.00       │    │
│  │   ▸ Sara Ali            #10198   EUR  3,200.00       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Currency  [ USD ▾ ]   Amount  [ 100.00 ]                    │
│                                                              │
│  Comment * (required — describe the reason for this entry)   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                                                      │    │
│  │                                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│  Min 3 characters · 0 / 280                                  │
│                                                              │
│  ┌─ Ledger preview (auto-generated, read-only) ─────────┐    │
│  │ Leg 1  CREDIT   ACME Trading (USD)        +100.00    │    │
│  │ Leg 2  DEBIT    Cash Vault (USD)          +100.00    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│                          [ Cancel ]   [ Post Transaction ]   │
└──────────────────────────────────────────────────────────────┘
```

### Inputs (step 2)
1. **Channel** — toggle: **Cash** / **Bank** (teller picks per transaction → determines vault).
2. **Customer account** — search box with live results (name, account #, phone, national ID). Selected account shows current balances per currency.
3. **Currency** — USD / EUR / LYD.
4. **Amount** — numeric, formatted with thousands separators, validated > 0.
5. **Comment** — **required**, prominently styled, with these rules:
   - Visible required asterisk and helper text "describe the reason for this entry"
   - Min 3 characters after trim, max 280
   - Live character counter
   - **Post Transaction** button stays disabled until comment passes validation
   - Server re-validates and rejects empty/whitespace comments
   - Inline error if the teller tries to submit without it: "A comment is required to post this entry."

### Ledger preview (always visible, always two legs)
Auto-builds from the inputs and updates live, so the teller sees exactly what will post before clicking:
- **Cash deposit** → Credit customer + Debit Cash vault
- **Bank deposit** → Credit customer + Debit Bank vault
- **Cash withdrawal** → Debit customer + Credit Cash vault
- **Bank withdrawal** → Debit customer + Credit Bank vault

### Entry number
Every transaction gets a sequential, human-readable ID like **TX-000128** generated on the server (gap-free sequence). Reserved when the form opens, shown at the top, and printed on the receipt. Used everywhere — search, audit, ledger, customer portal.

### Submit behavior
- **Deposit** → posts both legs atomically, returns receipt.
- **Withdrawal** with sufficient funds & under limit → posts both legs atomically, returns receipt.
- **Withdrawal** insufficient or over limit → form shows a clear banner ("Insufficient funds — requires admin approval" / "Exceeds debit limit — requires admin approval") and a **Submit for approval** button. Comment is still required. Nothing posts until admin approves.

### Receipt (after post)
Shows TX number, timestamp, teller name, direction, channel, both ledger legs, comment, customer balance after. Print-friendly.

### Keyboard shortcuts
- Step 1: `D` deposit, `W` withdraw
- Step 2: `C` cash, `B` bank, `/` focus search, `Enter` post (only when valid including comment)

---

## 4. Teller Activity Tracking

Every entry records: teller `user_id`, name, timestamp, IP, action (post/submit-for-approval), TX number, direction, channel, account, amount, comment, status. Available as:

- **My Activity** (`/app/me/activity`) — teller's own entries today/this week, totals by channel and direction.
- **Teller Activity report** (`/app/reports/tellers`, admin + auditor) — filter by teller, date range, direction, channel; shows count, gross deposits, gross withdrawals, net per teller. Exports to CSV.
- **Audit log** — every state change (post, approval, rejection, limit edit, account edit) recorded with actor and before/after.

---

## 5. Other Internal Pages

### Dashboard (`/app`)
- Totals per currency across all customer accounts
- Six vault balances (Cash + Bank, per currency) with reconciliation indicator
- Recent transactions feed (with TX numbers)
- Pending approvals queue
- Today's deposit/withdrawal volume split by cash vs bank, by teller
- Big **+ New Transaction** button → step 1 chooser

### Accounts (`/app/accounts`)
- Searchable list (same search component as the entry form); shows balances per currency, `nature` label, debit limits
- Account detail: balances, limits per currency, full ledger with TX numbers and comments

### Vaults (`/app/vaults`)
- Six vault cards grouped by Cash / Bank, per currency
- Per-vault movement history
- Read-only — vaults move only via paired customer transactions

### Approvals (`/app/approvals`, admin)
Pending withdrawals with reason (overdraft / over-limit), account, channel, amount, requesting teller, comment, TX number. Approve → posts both legs. Reject → records reason. Both audit-logged.

### Audit log (`/app/audit`, admin + auditor)
Full chronological state-change log.

### Users (`/app/users`, admin)
Create staff users, assign roles.

---

## 6. External — Consumer Portal

- Login → account overview with balances per currency
- Spreadsheet-style ledger: TX #, date, type, channel (cash/bank), currency, amount, running balance, comment
- Filter by date range, currency, channel; CSV export
- View-only

---

## 7. Onboarding

Admin creates customer accounts in-app, assigning `nature` (defaults to `credit`). Schema is ready for future middleware-based import from your existing SQL DB — `nature` labels travel with the data.

---

## 8. Error Handling & Integrity

- Direction is locked once chosen in step 1 — no accidental toggle on the entry form.
- **Comment is required** — enforced both client-side (button disabled, inline error) and server-side (posting function rejects empty/whitespace-only comments).
- Insufficient funds / over-limit withdrawals never post silently — they become pending approvals with a clear banner on the entry form.
- Channel + currency + customer + amount > 0 + comment all required before "Post" enables.
- Each transaction writes **exactly two** `ledger_entries` rows in a single Postgres transaction — partial writes impossible.
- Amounts stored as integer minor units (cents) — no float drift.
- TX numbers generated server-side from a gap-free sequence.
- Per-currency invariant verified by the posting function on every commit.
- All state changes logged with actor, timestamp, before/after.

---

## 9. Routes

Internal (`/app/...`, role-gated):
- `/app` — dashboard
- `/app/transactions/new` — **step 1: choose Deposit or Withdrawal**
- `/app/transactions/new/deposit` — entry form (deposit locked)
- `/app/transactions/new/withdraw` — entry form (withdrawal locked)
- `/app/transactions` — list with TX search
- `/app/accounts`, `/app/accounts/$id`
- `/app/vaults`
- `/app/approvals` (admin)
- `/app/me/activity` (any staff)
- `/app/reports/tellers` (admin + auditor)
- `/app/audit` (admin + auditor)
- `/app/users` (admin)

Consumer (`/portal/...`):
- `/portal` overview + ledger
- `/portal/account/$id`

Public:
- `/login`

---

## 10. Technical Notes

- **Stack**: TanStack Start + Lovable Cloud (Supabase Postgres + Auth).
- **Schema** (high level):
  - `profiles`, `user_roles` (admin | teller | auditor | consumer)
  - `accounts` (id, kind: customer|vault, nature: credit|debit, vault_channel: cash|bank|null, owner_user_id, name, status)
  - `account_balances` (account_id, currency, balance_minor, debit_limit_minor)
  - `transactions` (id, **tx_number** from gap-free sequence, customer_account_id, currency, direction, channel, amount_minor, **comment NOT NULL CHECK length(trim(comment)) >= 3**, status: posted|pending|rejected, created_by_user_id, approved_by_user_id, created_at, posted_at)
  - `ledger_entries` (transaction_id, account_id, side: debit|credit, amount_minor) — exactly two rows per posted transaction
  - `audit_log` (actor, action, target, before, after, ts)
- **Posting function** (Postgres `security definer`):
  1. Reserves/uses the TX number.
  2. Validates direction matches the route the teller came from.
  3. Validates comment is non-empty after trim (raises error otherwise).
  4. Resolves vault account from `(currency, channel)`.
  5. Locks both balance rows.
  6. Validates funds + limit on withdrawal (else routes to pending).
  7. For each leg, reads `account.nature`, compares to side, applies +/− amount.
  8. Inserts the two `ledger_entries` rows.
  9. Verifies per-currency invariant before commit.
- **Search**: customer search via Postgres `tsvector` over name + account # + phone + ID; live-queried from the entry form with debouncing.
- **RLS**: consumers read only own data; vaults staff-only; mutations only via the posting function.

---

## 11. Out of Scope for v1

- Customer-initiated transfers
- FX between currencies
- Live sync with existing SQL database (schema is import-ready)
- PDF statements (CSV only)
