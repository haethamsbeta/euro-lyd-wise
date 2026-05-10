Fix vault activity amount mapping in `src/routes/app.vaults.$id.tsx` (lambda mode):

1. Update the `recentActivity` mapper so each activity row preserves the raw backend fields instead of coercing to debit/credit:
   - Keep `amount_minor`, `cash_vault_effect_minor`, `cash_vault_direction`, `direction`, `currency_code`, `tx_number`, `holder_name`, `description`, `posted_at`, `balance_after_minor` as-is on the row object.
   - Stop pre-deriving `debit_minor`/`credit_minor` from `amount_minor` and stop forcing `direction` from those derived values.

2. Replace amount/direction logic in the activity table render with:
   ```ts
   const rawVaultAmountMinor =
     row.cash_vault_effect_minor !== null &&
     row.cash_vault_effect_minor !== undefined &&
     Number(row.cash_vault_effect_minor) !== 0
       ? row.cash_vault_effect_minor
       : row.amount_minor;
   const displayAmountMinor = Math.abs(Number(rawVaultAmountMinor || 0));
   const displayDirection = row.cash_vault_direction || row.direction;
   const displayCurrency = row.currency_code || vault.currency_code;
   ```
   Use `displayDirection` (string compare against "deposit"/"withdraw") to choose the in/out icon, color, and +/− sign. Render `formatMinor(displayAmountMinor, displayCurrency)`.

3. Remove the 30-day inflow/outflow recompute and balance-after running compute in lambda mode for the vault summary cards. Use backend-provided values from `api.vaults.get(id)`:
   - `balance_minor`, `inflow_minor`, `outflow_minor`, `transaction_rows`, `last_transaction_date`.
   Map these on the `vault` query and bind the hero/30-day cards to them. Keep visual layout untouched. The Balance-after column shows `balance_after_minor` if present, else `—` (no frontend recompute).

4. Add a one-time dev console log for the first activity row:
   ```ts
   if (import.meta.env.DEV && rows[0]) {
     const r = rows[0];
     console.log("[vault activity amount debug]", { tx_number: r.tx_number, amount_minor: r.amount_minor, cash_vault_effect_minor: r.cash_vault_effect_minor, rawVaultAmountMinor: ..., displayAmountMinor: ..., displayDirection: ..., displayCurrency: ... });
   }
   ```

5. Do not change the design, do not remove sections, do not add mock data, do not touch Supabase fallback path.

Validation: load `/app/vaults/:id`, confirm row `ALM-7463-175D474E` shows 23,000.00 USD with withdraw direction, and the summary cards reflect `/vaults/:id` totals (not recomputed).