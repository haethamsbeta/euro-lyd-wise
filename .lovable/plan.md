## Goal

Restrict the teller role across the staff app: hide vaults, balances, reports, customer-portal accounts, FX rates, branches, and all holder/account creation flows. Tellers should still process transactions and look up customers (without seeing money totals).

## What changes for tellers

| Surface | Today | After |
|---|---|---|
| Sidebar / "More" drawer | Sees Vaults, Reports, plus dashboard balance widgets | Vaults, Reports removed (Portal Accounts, FX Rates, Branches, Users are already admin-only) |
| Bottom dock | Right slot shows "Vaults" | Replaced with "My Activity" (already teller-allowed) |
| `/app/vaults` and `/app/vaults/$id` | Reachable | Hard-gated to admin + auditor (RoleGate) |
| `/app/reports` | Already admin/auditor | No change (verify) |
| `/app/portal-accounts`, `/app/admin/fx-rates`, `/app/admin/branches` | Already admin-only | No change (verify) |
| `/app/holders` index | "New holder" button is admin-only | Also hide any per-row balance/currency totals from tellers |
| `/app/holders/$id` | Shows consolidated balance card, per-account `current_balance`, totals-by-currency | For tellers: hide consolidated balance card, the per-account "Current balance" line, totals-by-currency strip, and the "Add linked account" button (already admin-gated) |
| `/app/accounts/$id` | Shows balance hero | Hard-gated away from tellers (RoleGate admin/auditor); they reach customer info via holders only |
| `/app/` dashboard | `TellerDashboard` already shows shift stats (no balances) | No change (already balance-free) |

Admins and auditors keep full access. Consumer portal routes are unaffected.

## Technical details

1. **`src/components/app/app-shell.tsx`** — in `NAV`, drop `"teller"` from the `roles` arrays for `/app/vaults` and `/app/reports` (reports is already admin/auditor — confirm).
2. **`src/components/app/bottom-dock.tsx`** — change the `teller` config `right` from `["Holders", "Vaults"]` to `["Holders", "MyActivity"]` (or "Approvals" hidden, "MyActivity" shown), wired to `/app/me/activity`. Verify the dock map already supports that key; add it if not.
3. **`src/routes/app.vaults.index.tsx`** and **`src/routes/app.vaults.$id.tsx`** — wrap component in `<RoleGate allow={["admin","auditor"]}>`.
4. **`src/routes/app.accounts.$id.tsx`** — wrap component in `<RoleGate allow={["admin","auditor"]}>`.
5. **`src/routes/app.holders.$id.tsx`** — compute `isTeller` via `useAuth` + `hasAnyRole`; conditionally hide:
   - the "Consolidated Balance" card,
   - the totals-by-currency rows,
   - each account card's "Current balance" value (replace with status only, or omit the line),
   - any link to `/app/accounts/$id` for tellers.
6. **`src/routes/app.holders.index.tsx`** — for tellers, omit balance/currency-summary chips on rows (the "New holder" button is already admin-gated).
7. **No DB / RLS changes** — request is presentation-only. Server policies already restrict mutations; this PR removes UI affordances and read paths from tellers consistently with that.

No backend, schema, or doc updates required.