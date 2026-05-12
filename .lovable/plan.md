## Goal

Stop the "Failed to load linked accounts: API error" crash on `/app/accounts` and wire the holder detail Linked Accounts tab to the confirmed-working per-holder endpoint.

## Scope (frontend only, no Supabase, no backend changes)

1. `src/routes/app.accounts.index.tsx` — global list, keeps `GET /holder-accounts`
2. `src/routes/app.holders.$id.tsx` — Linked Accounts tab uses `GET /holders/{holder.id}/accounts`
3. `src/lib/api/holders.ts` — `accounts()` adapter handles `{ items, next_cursor }` envelope

No other pages touched.

---

## 1) `/app/accounts` — resilient global list

Keep the existing `api.holderAccounts.list({...})` call hitting `GET /holder-accounts`. Do NOT aggregate per-holder. Replace the error rendering block:

- On `isError`: show a soft inline card:
  - Message: "Unable to load accounts right now. Please refresh."
  - Secondary muted line with the backend message (truncated) for context
  - "Retry" button calling `refetch()` from the `useQuery` result
- On success with `items.length === 0` and no active filters: clean empty state ("No linked accounts yet.")
- On success with empty items but active search/filters: "No accounts match your filters."
- Keep table, pagination, search, currency/status filters, and PageHeader rendered above the data area so the page never goes blank.
- Dev-only logging: when `import.meta.env.DEV`, log the resolved request URL and the `ApiError.message` / `details` on failure. Use the existing `[apiFetch]` log already in `dahabApi.ts`; add one extra `console.warn("[/app/accounts] holder-accounts failed", { message, status, details })` inside an `onError`-style effect or directly in the error branch.
- Pull `refetch` from `useQuery` destructure.

No change to query key, page-size, filter, or pagination logic.

## 2) `/app/holders/$id` — Linked Accounts tab via per-holder endpoint

Today the tab reads `holder.holder_accounts` returned inline by `api.holders.get(id)`. Switch it to a dedicated query against `GET /holders/{holder.id}/accounts`, gated on a real UUID.

- Keep the existing holder query (`api.holders.get(id)`) — it already accepts non-UUID identifiers (e.g. `dahab_account_number`) and returns the canonical `holder.id` (UUID).
- Add a UUID guard helper in the file:
  ```ts
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = (v: unknown) => typeof v === "string" && UUID_RE.test(v);
  ```
- Add a new query, only enabled once the holder query has resolved and `holder.id` is a UUID:
  ```ts
  const holderUuid = isUuid(holder?.id) ? (holder!.id as string) : null;
  const accountsQuery = useQuery({
    queryKey: ["holder-accounts.byHolder", holderUuid],
    enabled: !!holderUuid,
    queryFn: () => api.holders.accounts(holderUuid!),
  });
  ```
- Never call this endpoint with `dahab_account_number`, the route param, `undefined`, or `null`. The `enabled` flag enforces this.
- Replace `accounts = holder.holder_accounts ?? []` (used by the Linked Accounts tab and Overview tab) with `accountsQuery.data ?? []` for the Linked Accounts tab. Overview tab keeps the inline list to avoid a second blocking request on first paint; only the Linked Accounts tab uses the dedicated endpoint.
- Loading / empty / error states inside the Linked Accounts tab content:
  - While the holder query is loading: "Loading holder…"
  - Holder loaded, `accountsQuery.isLoading`: "Loading linked accounts…"
  - `accountsQuery.isError`: soft inline message + Retry button (`accountsQuery.refetch()`); never crash the tab.
  - Holder loaded, success, empty array: existing empty state ("No linked accounts yet.").
- Dev-only: `if (import.meta.env.DEV) console.log("[holder-accounts]", "/holders/" + holderUuid + "/accounts");` inside an effect that fires when `holderUuid` changes.

No changes to Overview, Transactions, Activity, or Notes tabs.

## 3) `src/lib/api/holders.ts` — adapter envelope

`accounts()` currently types as `HolderAccount[]`, but the confirmed response is:

```
{ success, data: { items: [...], next_cursor: null }, message }
```

`apiFetch` already unwraps `data`. Update the adapter to normalize either shape (array OR `{items}`) and always return `HolderAccount[]`:

```ts
accounts: (id: string | number) =>
  apiFetch<HolderAccount[] | { items: HolderAccount[]; next_cursor?: string | null }>(
    `/holders/${encodeURIComponent(String(id))}/accounts`,
  ).then((res) => (Array.isArray(res) ? res : (res?.items ?? []))),
```

URL-encode the path param. No other adapter methods change.

## Out of scope

- Per-holder aggregation on `/app/accounts`
- Backend changes
- Re-fetching holder data via Supabase
- Touching Overview, Transactions, Activity, Notes tabs on holder detail
- Any other page (vaults, approvals, sandbox, portal, etc.)

## Acceptance

- `/app/accounts` keeps calling `GET /holder-accounts`; on failure it shows a soft message + Retry, never a raw "API error"; empty results show clean empty state; dev console logs the URL + backend error.
- `/app/holders/:id` Linked Accounts tab calls `GET /holders/{UUID}/accounts` exactly once per holder, only after the holder UUID is resolved; never called with `undefined`, `null`, `dahab_account_number`, or any non-UUID value.
- Holder loading shows "Loading holder…"; empty linked accounts shows empty state, not an API error.
- No Supabase calls added; no new aggregation loops.  

&nbsp;

Confirmed plan:

1. /app/accounts

Keep using:

GET /holder-accounts

Do not replace it with per-holder aggregation.

Add:

- loading state

- clean empty state

- soft error state

- retry button

- development-only logging of the actual request URL and backend message

Do not show raw “API error” to the client.

2. Holder detail Linked Accounts tab

Use:

GET /holders/{holder.id}/accounts

Only call it with the resolved account holder UUID.

Do not pass:

- dahab_account_number

- account_number

- holder account id

- undefined

- null

3. No per-holder aggregation

Do not load all holders and loop through /holders/{id}/accounts.

Reason:

It is slower, creates many requests, complicates pagination, and is not ideal for the live demo.

4. Backend

If /holder-accounts still returns an API error, that is a backend issue to patch directly.

Frontend should not work around it with aggregation.

5. Acceptance

- /app/accounts no longer crashes.

- /app/accounts still calls only GET /holder-accounts.

- Holder detail Linked Accounts tab calls GET /holders/{holder.id}/accounts.

- Clean loading/empty/error/retry states.

- No Supabase.

- No production route changes outside the accounts/holder linked-account UI.

&nbsp;