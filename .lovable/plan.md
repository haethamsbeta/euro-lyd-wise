## Goal
Seed the database with a large, coherent mock dataset so every screen — vaults, accounts, transactions, approvals, audit, notifications, mobile (`/m`), and consumer portal — has realistic data to test against.

Data-only. No schema changes, no migrations, no app code changes. Uses the existing SECURITY DEFINER helpers (`_upsert_vault`, `_upsert_customer`, `_seed_post_tx`, `_seed_pending_tx`, `seed_demo_ledger`) so all double-entry ledger, balance, audit, and notification triggers fire correctly.

## What gets seeded

**Users (already in place)**
- `admin@demo.test` (admin), `teller@demo.test` (teller), `auditor@demo.test` (auditor), `consumer@demo.test` (consumer → owns Layla Hassan)

**Vaults (7)** with healthy opening balances
- Cash Vault — USD 250,000 / EUR 200,000 / LYD 2,500,000
- Bank Vault — USD 500,000 / EUR 400,000 / LYD 5,000,000
- Wire Vault — USD 300,000

**Customer accounts (20)** — auto-numbered, mixed currencies, a few with overdraft limits
Layla Hassan *(linked to consumer@demo.test)*, Omar Khalifa, Sara Ahmed, Mohamed Ali (500 USD limit), Fatima Saleh, Yusuf Al-Mansouri, Aisha Benghazi, Khalid Tripoli (1,000 USD limit), Noor Al-Sharif, Tariq Misrata, Hana Derna, Ibrahim Sabha, Mariam Zliten, Anas Al-Bayda, Salma Tobruk, Rami Ghadames (300 USD limit), Layan Al-Kufra, Bilal Sirte, Dina Al-Marj, Hassan Janzour.

**Posted transactions (~60)** spread across the last 30 days with backdated `posted_at` so charts and "recent activity" look natural. Mix of:
- Salary deposits (LYD), incoming wires (USD/EUR), counter cash withdrawals
- Cash ↔ Bank channel variety per currency
- Several large ones to trigger large-tx notifications
- 3–6 transactions per customer

**Pending approvals (5)** — withdrawals exceeding balance/limit
- Fatima 5,000 EUR bank, Mohamed 2,000 USD cash (over limit), Khalid 8,000 USD bank, Hana 1,500,000 LYD cash, Rami 1,200 USD cash (over limit)

**Notification preferences** — rows for admin + teller so thresholds work.

## Execution
Single SQL operation that:
1. Calls `seed_demo_ledger(admin_id, teller_id, consumer_id)` (idempotent base seed).
2. Adds the extra 15 customers, balances, ~50 more posted transactions (backdated across 30 days), and 3 more pending items via the existing helpers — guarded by existence checks so re-running is safe.
3. Tops up vault balances to the figures above.

## Verify after
- `/app` busy dashboard and recent activity
- `/app/vaults` 7 vaults funded across all currencies
- `/app/accounts` 20 customers with balances
- `/app/transactions` ~60 posted, filterable
- `/app/approvals` 5 pending
- `/app/audit` dense log
- Sign in as `consumer@demo.test` → `/m` and `/portal` show Layla's USD + LYD balances and her real history

Approve to run the seed.