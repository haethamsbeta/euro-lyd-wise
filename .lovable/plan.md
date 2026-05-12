## Goal

Create a new account group named **"126"** in the Groups page and link the 9 specified accounts as members.

## Verified data

All 9 account numbers exist in `holder_accounts`:

| Account # | holder_accounts.id |
|-----------|-------------------|
| 1261 | 94 |
| 1263 | 93 |
| 1264 | 211 |
| 1265 | 8 |
| 1266 | 136 |
| 1268 | 310 |
| 1269 | 103 |
| 1270 | 104 |
| 1271 | 138 |

## Changes

Two data inserts (no schema changes, no code changes):

1. **`account_groups`** — insert one row:
   - `name`: `"126"`
   - `group_type`: `"general"` (default; can be changed later via the Edit dialog)
   - `description`: `null`
   - `is_pinned`: `false`

2. **`account_group_members`** — insert 9 rows linking the new group's `id` to the 9 `holder_account_id`s above.

Both inserts run as a single SQL statement using a CTE so the new group's auto-generated `id` is captured and reused.

## Out of scope

- No UI / code changes.
- No backend endpoint changes.
- `group_type` defaults to `general`; tell me if you want family/corporate/vip/etc. and I'll switch it before running.
