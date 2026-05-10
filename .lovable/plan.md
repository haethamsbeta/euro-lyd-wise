## Goal

Holding Summary already reads `summary.holder_balances_by_currency` via the adapter. Two small gaps remain vs. the confirmed backend payload:

1. UI iterates a hard-coded `CURRENCIES = ["USD","EUR","LYD"]` list, so `GBP` rows returned by the backend are silently dropped.
2. UI only displays `balance_minor`. The backend also returns `account_count` and `holder_count` per currency, which the user explicitly wants visible.

No design change beyond inlining the two extra numbers as small subtext under each currency row, and rendering whatever currencies the backend returns (still in allow-list order).

## Changes — `src/routes/app.index.tsx`

### `HoldingsSummary` component (lines 834–899)

- Build the row list from `holderBalancesByCurrency` itself in lambda mode (preserve allow-list ordering: LYD, USD, EUR, GBP), instead of looping over the fixed `CURRENCIES` constant. Supabase fallback path keeps current `customerByCur` behaviour.
- For each row, render alongside the existing `formatMinor(balance_minor, currency)`:
  - `account_count` (e.g. `"104 accounts"`)
  - `holder_count` (e.g. `"104 holders"`)
  - Use small muted subtext under the currency label. No layout/colour change.
- Use `formatMinorOrMissing` for balance to keep the currency-allow-list guard.
- Keep `BackendPending` only when `holder_balances_by_currency` is truly absent (lambda + null). Once the field exists (even with empty array), render the rows section without `BackendPending`.
- Drop the dependency on `CURRENCIES` inside this component; max-bar calc derives from the rows.

### Adapter

`src/lib/api/dashboard.ts` already maps `currency_code → currency`, coerces stringified numbers via `Number(...)`, and exposes `account_count` / `holder_count`. No change needed.

## Out of scope

- No design redesign, no removal of sections.
- No changes to other widgets (Network Pulse, Vault gauges, Reports).
- No FX math, no fallbacks to `cash_by_currency` / `bank_by_currency` for holder totals.
- No mock data, no fabricated zeros — a currency missing from the backend list simply does not render.

## Verification

- Typecheck.
- Visually confirm Dashboard Holding Summary shows EUR / GBP / LYD / USD rows with their `balance_minor`, `account_count`, `holder_count` from the live payload (e.g. LYD 12,716,400,384 minor, 367 accounts / 347 holders).
- Confirm `BackendPending` no longer appears for Holding Summary in lambda mode.
