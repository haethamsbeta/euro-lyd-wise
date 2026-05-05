I confirmed the group is not actually empty: group 1 already has 7 member rows in the database. The screen stays empty because the page query is failing with a 400 error:

```text
Could not find a relationship between 'account_group_members' and 'holder_accounts' in the schema cache
```

The app is trying to render members using an embedded join from `account_group_members` to `holder_accounts`, but the database table is missing the foreign key that tells the API how those tables relate.

Plan:

1. Add the missing database relationship
   - Add a foreign key from:
     - `account_group_members.holder_account_id`
     - to `holder_accounts.id`
   - Use `ON DELETE CASCADE` so if a holder account is removed, stale group membership rows are cleaned up automatically.
   - Keep the existing primary key `(group_id, holder_account_id)` that prevents duplicate members.

2. Keep / verify supporting indexes
   - The existing index on `holder_account_id` is already present, but I will make the migration idempotent with `CREATE INDEX IF NOT EXISTS` so lookups stay fast.

3. Verify data integrity before applying
   - I already checked there are no orphaned group member rows, so the foreign key can be added safely.

4. Re-test the group page after the migration
   - Reload `/app/groups/1`.
   - Confirm the member query no longer returns 400.
   - Confirm the existing 7 members display in the table.
   - Add another member and confirm it appears immediately after the query refreshes.

5. Add a small UI resilience improvement if needed
   - If the embedded join still waits for schema cache refresh, update the page to fetch group member rows first, then fetch `holder_accounts` / `account_holders` by IDs as a fallback. This avoids the screen appearing empty if the backend relationship cache is temporarily stale.