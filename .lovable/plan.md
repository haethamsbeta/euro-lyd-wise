## Root cause

The BackendPending widgets are gated on **derived/filtered** arrays, not the raw backend arrays:

- **Daily Transactions** checks `dailyVolume7d.length === 0`, but `dailyVolume7d` is filtered to `currency === "LYD"` only. If the backend returns 3 rows that are USD/EUR/GBP, the filter yields 0 → BackendPending shows even though `overview.daily_volume_7d.length === 3`.
- **Balance by Currency** checks `currencyDistribution.length === 0`, derived via `displayCurrency()`. If backend currency codes don't match the strict allow-list, derived length can be 0.
- **Customer Growth** maps `r.month` / `r.new_holders`. If backend uses `m` / `count` (or zeros), the derived array length still matches but values may be empty — gating is fine here, but should still use raw backend length per the spec.
- **Top Accounts** correctly uses raw `topAccounts` (good).
- **Debug block** is gated by `import.meta.env.DEV`, so it's invisible in the deployed preview the user is looking at.

## Fix (frontend render-conditions only)

### 1. `src/routes/app.reports.tsx` — gate every Business Overview widget on **raw backend array lengths**

Replace the gating expressions:

| Widget                | Current condition                          | New condition                                                  |
|-----------------------|--------------------------------------------|----------------------------------------------------------------|
| Daily Transactions    | `dailyVolume7d.length === 0`               | `(overview?.daily_volume_7d?.length ?? 0) === 0`               |
| Balance by Currency   | `currencyDistribution.length === 0`        | `(overview?.currency_distribution?.length ?? 0) === 0`         |
| Customer Growth       | `customerGrowth.length === 0`              | `(overview?.customer_growth_7m?.length ?? 0) === 0`            |
| Top Accounts          | `!topAccounts \|\| topAccounts.length===0` | `(overview?.top_accounts?.length ?? 0) === 0`                  |

Also relax the **Daily Transactions** series so it doesn't silently empty when backend returns no LYD rows: if the LYD-filtered series is empty but the raw array has rows, plot one currency we do have (prefer LYD; otherwise the first currency present), and label the axis with that currency. Still no FX summing across currencies.

### 2. Make the debug block always visible

Remove the `import.meta.env.DEV` guard so the line:

```
Business overview loaded — counts: true · daily_volume_7d: 3 · currency_distribution: 3 · customer_growth_7m: 1 · top_accounts: 50 · volume_by_currency_30d: 3
```

renders directly under the page header in production preview too. Keep it small/mono, unobtrusive.

### 3. Banner condition

`overviewPending` already uses `hasOverviewPayload` against raw arrays — leave as-is. With confirmed backend data, the banner with "KPI strip will populate once the backend reports overview endpoint is available" will not render.

### 4. Network Volume 30d

The KPI strip already sources from `volByCcy` (`overview.volume_by_currency_30d`); no separate BackendPending exists for it, so no change required beyond confirming the banner stays hidden.

## Out of scope

- No backend changes, no mock data, no Supabase fallback, no FX math, no redesign.
- Approval Speed / Hourly Traffic / Cash Flow / Liquidity / Tellers / Compliance pending blocks are unrelated to Business Overview and stay as-is.

## Verification

1. Typecheck (`tsc --noEmit` via harness).
2. Grep `src/routes/app.reports.tsx` to confirm the four exact strings ("KPI strip will populate…", "daily_volume_7d not yet returned.", "currency_distribution not yet returned.", "customer_growth_7m not yet returned.", "top_accounts not yet returned.") still exist as `note=` props but are only reachable when raw backend arrays are empty.
3. Open `/app/reports` — debug line shows non-zero counts, and none of the four Business Overview widgets render BackendPending.
4. Update `docs/LAMBDA_REPORTS_WIRING_AUDIT.md` diagnostic note to record that the gating bug was filtered-array based, not raw-array based.