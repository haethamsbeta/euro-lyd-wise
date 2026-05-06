## Goals

1. **Fix member count** on the Groups list cards. Today the card shows the number of *currencies returned by the totals RPC*, not the actual member count. Empty groups always show "0 acct" even after adding members because `get_group_totals` only returns currency rows that have accounts — and the count is being misread anyway.
2. **Scaffold the AWS backend client** (`VITE_API_BASE_URL`, `src/lib/dahabApi.ts`, typed response envelope, page/empty/error/loading helpers) so pages are ready to switch over later. No live endpoint wiring in this pass — Supabase keeps powering all pages exactly as it does today.

Out of scope for this turn: replacing Supabase calls in Holders / Transactions / Vaults / Groups, auth changes, removing mock/demo data, deleting Supabase. Those happen after you confirm the AWS endpoints are live.

---

## Part 1 — Group member count fix

File: `src/routes/app.groups.index.tsx`

- In `GroupCard`, add a second lightweight query that counts members directly:
  ```ts
  supabase
    .from("account_group_members")
    .select("holder_account_id", { count: "exact", head: true })
    .eq("group_id", id)
  ```
- Render the badge as `{count} member{count===1?"":"s"}` instead of summing `account_count` from the totals RPC.
- Keep the per-currency totals block below as-is (it stays driven by `get_group_totals`).
- Invalidate `["group-members-count", id]` from the existing add/remove member mutations in `app.groups.$id.tsx` so the list card updates immediately when you come back.

Result: every group card shows the true member count before you click in, including groups with 0 currencies of activity.

---

## Part 2 — AWS API client scaffold

Goal: get the plumbing in place so a future turn just swaps `useQuery` bodies. **No page behavior changes.**

### 2a. Env

Add to `.env` (local) and document for prod:
```
VITE_API_BASE_URL=https://u2j81refrf.execute-api.eu-north-1.amazonaws.com
```

### 2b. New file `src/lib/dahabApi.ts`

A thin typed fetch wrapper:

- Reads `import.meta.env.VITE_API_BASE_URL`.
- Standard envelope type:
  ```ts
  type ApiEnvelope<T> = { success: boolean; data: T; message: string; timestamp: string };
  ```
- `apiFetch<T>(path, init?)`: prepends base URL, sets `Content-Type: application/json`, parses envelope, throws `ApiError(message, status)` when `success === false` or HTTP not OK, returns `data`.
- Auth hook stub: an `authTokenProvider` setter (e.g. `setAuthTokenProvider(() => Promise<string|null>)`). The wrapper calls it and adds `Authorization: Bearer <token>` if present. Default provider returns `null`. This lets us plug in whatever token scheme the backend ends up using (your "user login separate from DB credentials" answer) without touching call sites.
- Typed endpoint helpers, all matching the spec but **not yet called by any page**:
  - `holders.list()`, `holders.get(id)`, `holders.create(body)`, `holders.accounts(id)`
  - `holderAccounts.ledger(holderAccountId, { from?, to? })`, `holderAccounts.create(holderId, body)`
  - `transactions.list(params)`
  - `internalAccounts.list()` (a.k.a. `vaults.list()`)
- Shared TS types matching the DahabDB tables you described: `Holder`, `HolderAccount`, `LedgerEntry`, `Transaction`, `InternalAccount`, plus enums for `Currency = "LYD"|"USD"|"EUR"|"GBP"` and `AccountNature = "Debit"|"Credit"`.

### 2c. New file `src/lib/dahabQueryKeys.ts`

Centralized query key factory for the future migration (e.g. `dahabKeys.holders.list()`, `dahabKeys.holderAccounts.ledger(id, range)`). Not consumed yet; just defined so future PRs are mechanical.

### 2d. New file `src/components/app/data-states.tsx`

Three tiny presentational components used by future AWS-wired pages:
- `<Loading label="Loading…" />` (spinner + text)
- `<EmptyState title description action? />`
- `<ErrorState error onRetry? />`

Drop-in so each migrated page gets consistent loading / empty / error UX as required.

### 2e. Safety rails

- Do NOT import `dahabApi` from any existing page in this turn.
- Do NOT remove any Supabase imports, mock data, or RLS code.
- README/comment at the top of `dahabApi.ts` makes clear it is unused until endpoints are confirmed.

---

## Files

Created:
- `src/lib/dahabApi.ts`
- `src/lib/dahabQueryKeys.ts`
- `src/components/app/data-states.tsx`

Edited:
- `src/routes/app.groups.index.tsx` (member count)
- `src/routes/app.groups.$id.tsx` (invalidate count key on add/remove)
- `.env` (add `VITE_API_BASE_URL`)

---

## What happens next (not this turn)

When you say "wire it up", we will, page by page: replace each `useQuery` body with a `dahabApi.*` call, swap loading/empty/error to the new components, delete the corresponding Supabase calls, and finally remove the Supabase client + types once every page is migrated and verified against the live AWS endpoints.
