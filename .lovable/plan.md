## Goal

In the Vaults page, keep the two categories (Cash Vault, Bank Vault) but show each currency (USD, EUR, LYD) inside as a separately clickable sub-account. Clicking a currency opens a detail view showing only that vault's transactions for that currency.

## Why this approach

The database has only 2 vault accounts (Cash Vault, Bank Vault), each holding balances for all 3 currencies. Rather than splitting the schema into 6 vault accounts (which would require a migration and break existing transactions), we treat `(vault_account_id, currency)` as the addressable "sub-account". Transactions already carry both `vault_account_id` and `currency`, so filtering is clean.

## Changes

### 1. Vaults list page (`src/routes/app.vaults.index.tsx`)

Restructure each vault card so every currency row is its own clickable link:

```text
┌─ Cash Vault ──────────────── CASH ─┐
│  USD   $26,135.00          →       │  ← clickable
│  EUR   €19,845.00          →       │  ← clickable
│  LYD   ل.د 258,320.00      →       │  ← clickable
└────────────────────────────────────┘
```

- Remove the single card-wide `<Link>` wrapper.
- Render each currency row as its own `<Link to="/app/vaults/$id" params={{ id: v.id }} search={{ currency: c }}>` with hover state and a chevron.
- Card header (vault name + channel badge) stays as a non-link label.

### 2. Vault detail route (`src/routes/app.vaults.$id.tsx`)

Add an optional `?currency=USD|EUR|LYD` search param:

- Validate via `validateSearch` returning `{ currency?: "USD"|"EUR"|"LYD" }`.
- When `currency` is present:
  - Page title becomes `"{Vault Name} · {currency}"`.
  - Balances card shows only that one currency (large, prominent), with a small "View all currencies" link that clears the param.
  - Transaction query adds `.eq("currency", currency)` so only that currency's transactions appear.
- When `currency` is absent: current behavior (all 3 currencies, all transactions) — preserves backward-compat with existing dashboard links.

### 3. Dashboard deep-links (`src/routes/app.index.tsx`)

Update `VaultRow` so the Cash/Bank rows on the dashboard also pass the currency, matching the new pattern (so a user clicking "Cash Vault · USD" on the dashboard lands on the same currency-scoped view).

### 4. i18n strings (`src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`)

Add:
- `vaults.viewAllCurrencies` → "View all currencies" / "عرض كل العملات"
- `vaults.transactionsFor` → "Transactions for {currency}" / "حركات {currency}"

## Files

- Edit `src/routes/app.vaults.index.tsx` — per-currency clickable rows.
- Edit `src/routes/app.vaults.$id.tsx` — optional `currency` search param + filtered query + scoped UI.
- Edit `src/routes/app.index.tsx` — pass `search={{ currency }}` from dashboard vault rows.
- Edit `src/lib/i18n/en.ts` and `src/lib/i18n/ar.ts` — new strings.

## Out of scope

- No DB migration. Vault accounts stay as 2 rows; currency is a filter, not a separate account.
- Customer accounts unchanged.