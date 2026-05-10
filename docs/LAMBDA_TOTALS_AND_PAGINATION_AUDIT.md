# Lambda Totals & Pagination Audit

**Rule:** never use `array.length` of a limited list endpoint as a database
total. All true totals must come from `GET /dashboard/staff` → `summary`.

DAHABDB ground truth (as of 2026-05-10):
- `account_holders` = **408**
- `holder_accounts` = **659**
- `transactions` = **23,484**
- `vaults` = **10**

Required summary fields on `/dashboard/staff`:
- `summary.holder_count`
- `summary.holder_account_count`
- `summary.transaction_count`
- `summary.vault_count`
- `summary.pending_approvals`
- `summary.txns_today`

If any field is missing, the UI renders `—` and the backend ticket below
must be filed.

## Page-by-page

| Page | Endpoint | Limit sent | Currently displayed | Correct total source | Pagination needed? |
|---|---|---|---|---|---|
| `/app` (Dashboard) | `/dashboard/staff`, `/vaults`, `/transactions?limit=8` | 8 (recent tx) | KPI strip: holders / linked accounts / transactions / vaults from `summary.*` | `summary.holder_count`, `summary.holder_account_count`, `summary.transaction_count`, `summary.vault_count` | No — KPI uses summary |
| `/app/holders` | `/holders?limit=200` | 200 | "Total holders: 408 · Linked accounts: 659 · Showing first N" | `summary.holder_count`, `summary.holder_account_count` | **Yes** (cursor / offset) |
| `/app/holders/$id` | `/holders/{id}`, `/holders/{id}/accounts` | n/a | per-holder detail | n/a | No |
| `/app/transactions` | `/transactions?limit=50&offset=N` | 50 | "Showing latest 50 of 23,484 transactions"; per-window KPIs labelled `(loaded)` | `summary.transaction_count` | **Yes** (offset/cursor; UI already has disabled Next) |
| `/app/transactions/$id` | `/transactions/{id}` | n/a | single tx | n/a | No |
| `/app/vaults` | `/vaults` | none | All vault cards; "Active Vaults" prefers `summary.vault_count` | `summary.vault_count` | No (10 rows max) |
| `/app/vaults/$id` | `/vaults/{id}`, `/vaults/{id}/activity` | activity limit | per-vault detail | n/a | No |
| `/app/reports` | `/reports/*` | endpoint specific | "Total Customers" / "Total Transactions" from summary; per-loaded-window stats labelled `(loaded)`; missing endpoints render `—` | `summary.*` for totals; reports endpoints for series | Series endpoints handle their own paging |
| `/app/audit` | `/audit?limit=…` | n/a | TODO — must show `Showing first N of {audit_count}` once backend exposes count | `summary.audit_count` (NEW) | **Yes** |
| `/app/users` | `/users?limit=…` | n/a | TODO — must show `Showing first N of {user_count}` | `summary.user_count` (NEW) | **Yes** |
| `/app/approvals` | `/transactions?status=pending` | n/a | "Pending: N" — N is the loaded count, not DB total | `summary.pending_approvals` | **Yes** |
| `/app/groups` | `/groups` | none | full list | n/a | No |
| `/portal/...` | `/portal/...` | n/a | per-account view | n/a | No |
| `/m/dashboard` | mirrors `/app` | 8 | mobile KPI tiles | same `summary.*` | No |

## Forbidden patterns to keep watching

```text
.length used as a "DB total"        ← forbidden
.length used in a "showing N" label ← OK
.length === 0 empty-state guard     ← OK
```

## Backend tickets

1. Confirm `/dashboard/staff` returns `holder_count`, `holder_account_count`,
   `transaction_count`, `vault_count` in `summary`.
2. Add `summary.user_count`, `summary.audit_count` for the Users and Audit
   pages.
3. Implement cursor-based pagination on `/holders`, `/transactions`,
   `/users`, `/audit` so the UI can wire real Next/Previous controls.
