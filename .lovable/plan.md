## Goal

Fix incorrect "linked account" counts on Holder cards / Holder Detail and clean up the Holder Accounts page (remove "Showing first N", remove bottom pager). Counts must come from the backend `linked_account_count` field, never from the length of paginated frontend arrays.

## Findings

- `src/routes/app.holders.index.tsx` line 225: card shows `(h.holder_accounts ?? []).length` — this is the inline array attached to the holder list payload, which is whatever the backend embedded (possibly truncated, possibly empty), not the true holder-level count.
- Same file lines 158–164: header badge says "Showing first {summary.holders}" and computes currency counts from a bounded `api.holders.list({ limit: 1000 })` call — must be removed (counts are not real).
- Same file lines 238–260: bottom "Showing X–Y of N holders" + Previous/Next pager — user wants this removed (search-only browsing).
- `src/routes/app.holders.$id.tsx` (holder detail): linked-accounts tab shows the inline `holder_accounts` list. We should label any count there as "Accounts loaded" and prefer `holder.linked_account_count` when the backend returns it for the summary.
- `src/lib/dahabApi.ts` already declares `linked_account_count?: number` on the Holder type — backend field exists.
- `src/routes/app.accounts.index.tsx` already uses backend `total` (= 659). No change needed beyond keeping it as the source of truth. The per-row `linked_ledger_count` shown there is account-level (ledger entries), not a holder count — that label is already correct ("ledger entries").

## Changes (frontend only)

### 1. `src/routes/app.holders.index.tsx`

- Card linked-account line: bind to `h.linked_account_count`.
  - If `typeof h.linked_account_count === "number"` → `"Linked accounts: {n}"`.
  - Else → `"Linked accounts: —"` with a tiny `title` tooltip noting the backend field is missing. Do NOT fall back to `holder_accounts.length`.
- Keep the currency chip row underneath as `(h.holder_accounts ?? []).map(...)` but only as a preview of loaded accounts (no count label on it).
- Remove the entire `summary` query and the header badge block (lines ~32–60 and ~158–191), including "Showing first {summary.holders}" and the per-currency `(loaded)` chips. Keep:
  - Total holders badge sourced from `dashSummary.holderCount` only (`Total holders: {fmtTotal(...)}`).
  - "View all linked accounts →" link.
- Remove `curFilter` state and the currency filter buttons entirely (they depended on the removed summary and filtered by loaded-page contents — misleading).
- Remove the bottom pager block (Showing X–Y, Previous/Next) and `offset` paging UI. Keep a single `api.holders.listPaged({ q, limit: PAGE_SIZE, offset: 0 })` fetch driven by search only; drop `offset` state and reset effect. Show all returned items from the search (backend caps page size). If no `q`, show the first page and add a small muted note: "Use search to find a specific holder."
- Remove now-unused imports: `ChevronLeft`, `ChevronRight`, `keepPreviousData` (if unused), `supabase` (if unused after summary removal — verify the search Supabase branch; in lambda mode it's not used, leave only if non-lambda branch still references it).

### 2. `src/routes/app.holders.$id.tsx`

- In the lambda mapper (around line 80), pass through `linked_account_count: r.linked_account_count ?? null` on the returned holder object.
- In the Linked Accounts tab header / Overview summary, show:
  - If `holder.linked_account_count != null` → "Linked accounts: {linked_account_count}".
  - The inline list count, if shown anywhere, must be labeled "Accounts loaded for this holder" — never as the holder total.

### 3. `src/routes/app.accounts.index.tsx`

- No logic change. Verify the header still reads `Showing X–Y of {fmtTotal(total)} linked accounts` where `total` comes from backend `data.total` (659). It already does.
- Keep per-row `linked_ledger_count` line as-is (it's labeled "ledger entries", which is account-scoped and accurate).

## Out of scope

- No backend changes. If `/holders` doesn't yet return `linked_account_count`, the card shows "—" — we do not invent or compute it from arrays.
- No redesign of cards or detail page.
- No Supabase fallback added in lambda mode.

## Acceptance

- Holder cards show `Linked accounts: {linked_account_count}` (or `—` if backend omits it). Never `holder_accounts.length`.
- Holder detail summary prefers `linked_account_count`; any inline list count is labeled "loaded".
- Holder Accounts page total continues to show 659 from backend `total`.
- Holders page no longer shows "Showing first N" header or bottom Previous/Next pager.
- `bunx tsc --noEmit` passes.