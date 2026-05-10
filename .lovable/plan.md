## Goal
Stop the Transactions page from hanging in lambda mode. In lambda mode, fetch from `GET /api/transactions?limit=10` and read rows from `response.data.items`. In supabase mode, behavior is unchanged.

## URL convention
All existing adapters use paths starting with `/api/...` (e.g. `/api/holders`, `/api/audit`). So `VITE_API_BASE_URL` must NOT include `/api` (set it to `https://u2j81refrf.execute-api.eu-north-1.amazonaws.com` or the stage root). The transactions adapter will follow the same convention: `/api/transactions`.

## Changes

### 1. `src/lib/dahabApi.ts`
Add the paged envelope type (no behavior change to `apiFetch`):
```ts
export interface PagedResult<T> {
  items: T[];
  total?: number;
  limit?: number;
  offset?: number;
  next_cursor?: string | null;
}
```

### 2. `src/lib/api/transactions.ts`
Unwrap `data.items` while keeping the `Transaction[]` return type:
```ts
list: async (params = {}) => {
  const res = await apiFetch<PagedResult<Transaction> | Transaction[]>(
    `/api/transactions${qs(params)}`,
  );
  return Array.isArray(res) ? res : (res?.items ?? []);
},
myRecent: async (limit = 10) => {
  const res = await apiFetch<PagedResult<Transaction> | Transaction[]>(
    `/api/transactions/me/recent${qs({ limit })}`,
  );
  return Array.isArray(res) ? res : (res?.items ?? []);
},
```

### 3. `src/routes/app.transactions.index.tsx`
Branch on `DATA_BACKEND` from `@/lib/runtimeConfig`.

**Lambda branch** — replace the `useQuery` body with:
```ts
const rows = await api.transactions.list({ limit: 10 });
return rows.map<Tx>((r) => ({
  id: String(r.id),
  tx_number: r.tx_number,
  direction: r.direction,
  channel: (r as any).channel ?? "cash",
  currency: (r as any).currency ?? r.currency_code,
  amount_minor: (r as any).amount_minor ?? 0,
  status: r.status as Tx["status"],
  comment: r.description ?? (r as any).comment ?? "",
  created_at: (r as any).created_at ?? r.posted_at,
  customer_account_id: String((r as any).customer_account_id ?? ""),
  reverses_tx_id: (r as any).reverses_tx_id ?? null,
  corrected_by_tx_id: (r as any).corrected_by_tx_id ?? null,
  customer_name: null,
  customer_account_number: null,
  customer_dahab_number: null,
  attachment_count: 0,
}));
```
- Skip the `holder_accounts` `dahabMap` query in lambda mode (set `enabled: false`).
- Do NOT compute amounts from `debit_amount`/`credit_amount` — use `amount_minor` + `direction` directly.
- Keep all existing filters, KPIs, chips, polling intervals, and rendering unchanged.

**Supabase branch** — keep current `supabase.from("transactions")` query unchanged.

**Loading / error / empty:**
- `useQuery` already exposes `isLoading` and `error`; the page already renders an empty state when filtered rows are zero. No infinite spinner — `apiFetch` resolves or throws, react-query surfaces the error. Add a small retry button next to the error message in lambda mode if not already present.

### 4. PDF export `buildRows`
Same branching:
- Lambda: `await api.transactions.list({ from: from.toISOString(), to: to.toISOString(), limit: 5000 })`, then map to the same row shape used today (customer column shows `—`).
- Supabase: keep existing query.

### 5. Out of scope
- Transaction detail page, new-transaction wizard, approvals, other routes
- Realtime / polling layer (already wired)
- Joined customer/holder display in lambda mode (backend will add later)
- No SSE/WebSocket
- No `Transaction` type changes beyond what's already in `dahabApi.ts`

## Verification
- `VITE_DATA_BACKEND=lambda` + backend returning `{ data: { items: [...] } }` → rows render.
- Empty `items` → empty state, no spinner.
- API error → error message + retry, no infinite spinner.
- `VITE_DATA_BACKEND=supabase` (default) → unchanged.
- Build passes; `rg "supabase\.from\(\"transactions\"\)" src/routes/app.transactions.index.tsx` shows only the supabase-mode branch.
