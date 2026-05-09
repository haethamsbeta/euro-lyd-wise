## Account Detail upgrade — Section 23

### 1. New route: `src/routes/app.accounts.$id.tsx`
Dedicated full-page view replacing the inline expand. Layout (top → bottom):

```
[ Hero ]   currency-tinted gradient (LYD gold / USD emerald / EUR blue / GBP lavender)
           ← Back · Account # · DAHAB # · Currency badge · Nature · Status
           Display name (RTL)  ·  alias
           Held by → link to /app/holders/{holderId}
           Action bar: Deposit · Withdraw · Edit · kebab (⋯ Suspend / Close)
           Transfer button removed.

[ KPI strip · 4 tiles ]
   Current Balance · Available (balance + active withdraw limit)
   30d Credits ▲green · 30d Debits ▼red

[ Balance sparkline ]  inline SVG, derived from balance_after of last 30d ledger rows

[ Withdrawal Limits card ]   currency-aware (see §3)
   Toggle Enabled · Amount input with currency presets · Note
   Live utilization bar (used / limit) · 70% amber · 90% red tone
   Save / Cancel; toast 2.5s; outside-click closes edit mode

[ Credit / Debit limits card ]   inline editor (admin only)

[ Transactions table ]
   Search · Date range · Sort by date/amount/balance · CSV export
   Columns: Date · TX# · Description · Debit · Credit · Balance
   Row click → /app/transactions?tx={tx_number} (if matches) else inert
```

### 2. Routing & deep-links
- New file `src/routes/app.accounts.$id.tsx`, `notFoundComponent` = "Account not found · Back to Holders".
- `src/routes/app.holders.$id.tsx`: account cards become `<Link to="/app/accounts/$id">`. Keep `#account-N` hash → if present, navigate straight to detail.
- `src/routes/app.groups.$id.tsx`: account rows already deep-link to holder hash — switch to `/app/accounts/{id}` directly.

### 3. Currency-aware withdraw limits
Presets table in component:
```
LYD: 50k / 250k / 1M   step 1000
USD: 1k / 5k / 25k     step 100
EUR: 1k / 5k / 25k     step 100
GBP: 1k / 5k / 25k     step 100
```
Utilization = `current_balance < 0 ? abs(current_balance)/limit : 0`. Tone: <70 emerald · 70–90 amber · ≥90 red.
Reuses existing `sp_set_holder_withdraw_limit` RPC.

### 4. Role gating (uses `useAuth`/`hasAnyRole`)
| Control | Admin | Teller | Auditor | Consumer |
|---|---|---|---|---|
| View | ✓ | ✓ | ✓ (read-only) | own only |
| Deposit/Withdraw | ✓ | ✓ | — | — |
| Edit limits / withdraw | ✓ | — | — | — |
| Suspend/Close | ✓ | — | — | — |

### 5. Transfer removal (§23.7)
Strip Transfer entry points:
- `src/components/app/new-transaction-wizard.tsx` — remove transfer step/option.
- `src/routes/app.transactions.new.index.tsx` — remove Transfer card.
- HolderDetail and BottomDock — remove any Transfer button (keep Deposit / Withdraw).
- Leave descriptive labels in tx history untouched.

### 6. Visuals
Reuse tokens from `styles.css` (`--gold`, `--success`, currency tint vars from `CurrencyBadge`). Hero uses `card-luxe` + currency tint overlay. Sparkline = pure inline SVG, no chart lib. Toasts via existing `sonner`. Kebab via shadcn `DropdownMenu` with outside-click close.

### 7. HolderDetail simplification
Remove `LimitsEditor` / `WithdrawLimitEditor` / `LedgerPanel` blocks (now lives on Account Detail). Cards collapse to clickable summary tiles linking to `/app/accounts/{id}`. Hash deep-link redirects to the new page.

### 8. Files touched
- **new** `src/routes/app.accounts.$id.tsx`
- edit `src/routes/app.holders.$id.tsx` (link out, drop editors)
- edit `src/routes/app.groups.$id.tsx` (deep-link target)
- edit `src/components/app/new-transaction-wizard.tsx`, `app.transactions.new.index.tsx`, `bottom-dock.tsx` (remove Transfer)

No DB migrations required — schema already supports everything (`holder_accounts`, `holder_ledger_entries`, RPC, role checks).
