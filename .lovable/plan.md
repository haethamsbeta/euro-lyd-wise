## Problem

On Step 2 (Customer) of the New Transaction wizard, search results render but clicking a customer row or account tile does nothing. You can search, but you can't move forward.

## Root cause

The Lambda backend returns GUID strings for IDs (e.g. `"1E11F8B6-B742-4B93-A3F6-A13BD6700BD8"`), but `src/components/app/new-transaction-wizard.tsx` coerces them with `Number(...)` when building each `HolderCardHit`:

```ts
holder_account_id: Number(r.id),
account_holder_id: Number(r.account_holder_id),
```

`Number("1E11F8B6-…")` is `NaN`. Consequences:

- `setBrowseHolderId(holder.account_holder_id)` stores `NaN`.
- `selectedHolderId = picked?.account_holder_id ?? browseHolderId` is `NaN`, which is **falsy**, so the `if (!selectedHolderId …)` guards make `selectedHolder` resolve to `null` and the UI stays in search mode forever.
- `Map<number, …>` grouping by `NaN` and the `r.account_holder_id === selectedHolderId` filters all break (`NaN !== NaN`).

That's why the click appears to do nothing.

## Fix

Stop coercing GUIDs to numbers. Keep IDs as the type the API returns (string for Lambda, number for legacy).

### Changes (single file: `src/components/app/new-transaction-wizard.tsx`)

1. Widen the `HolderCardHit` type:
   - `holder_account_id: string | number`
   - `account_holder_id: string | number`

2. In the search `queryFn` (lambda branch), drop the `Number(...)` casts:
   - `holder_account_id: r.id`
   - `account_holder_id: r.account_holder_id`

3. Update the customer-grouping `Map` type from `Map<number, …>` to `Map<string | number, …>`.

4. Update `useState<number | null>(null)` for `browseHolderId` to `useState<string | number | null>(null)`.

5. Where the post mutation passes `holder_account_id: picked!.holder_account_id`, no change needed beyond the type widening — the API already accepts string IDs (see `accountsApi.get` signature `string | number`).

No changes to design, business logic, vault routing, or backend calls. No Supabase reintroduced.

## Verification

- Type-check passes after widening.
- Manually: search for a customer, click the row → "Selected customer" card appears with the account tiles, click an account tile → tile becomes selected (gold ring + check), Continue button enables, wizard advances to Step 3 (Vault).
