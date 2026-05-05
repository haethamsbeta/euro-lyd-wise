## Verify build & app health after portal duplicate fix

The duplicate `src/routes/portal...tsx` was already deleted. On-disk `src/routeTree.gen.ts` now contains exactly one `PortalRoute` declaration at line 45, and the prior `"PortalRoute" has already been declared` error in the dev-server log is historical (logged before the file was removed).

I want to actually run/exercise the build and key routes to confirm everything is healthy. This needs default mode (state-changing exec).

### Steps

1. **Confirm route tree is clean**
   - `grep -n "const PortalRoute " src/routeTree.gen.ts` → expect a single match.
   - `ls src/routes/portal*` → expect only `portal.tsx` and `portal.$accountId.$currency.tsx`.

2. **Run a fresh build**
   - `bun run build` (or `bun run build:dev`) and confirm exit 0 with no esbuild "already declared" errors.

3. **Check the dev-server log for fresh errors**
   - `tail -n 100 /tmp/dev-server-logs/dev-server.log` after a touch/restart trigger; look for any new vite/transform errors.

4. **Smoke-test key routes via the in-sandbox HTTP server**
   - GET `/`, `/login`, `/app`, `/portal`, `/portal/anything/USD` → expect 200 (or appropriate auth redirect), no 500s.
   - Use `stack_modern--invoke-server-function` or a `curl` against the local dev port.

5. **Check linked-account behavior end-to-end (read-only DB checks)**
   - `supabase--read_query` to confirm:
     - `account_holders` has `phone`, `email` columns.
     - The partial unique index `account_holders_one_active_per_user` exists.
     - RPC `get_holder_currency_totals` exists and returns rows for a sample holder.
   - Confirm `holder_accounts` rows are correctly linked to a single `account_holders` row (no orphans, currencies can repeat per holder, every holder has ≥1 linked account).

6. **Run Supabase linter**
   - `supabase--linter` to catch any RLS or function-search-path issues introduced by recent migrations.

7. **Report back**
   - Build status, any errors found, and a short health summary of routes + DB invariants.

### Expected outcome

No code edits unless step 2–6 surface a real issue. If a regression is found (e.g., a stale import to the deleted `portal...tsx`, a missing column, or a broken RPC), fix it minimally and re-verify.
