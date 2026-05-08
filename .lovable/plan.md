## Add "Create account" page for new customers

Currently new customers (holders) are created via the `NewHolderDialog` modal triggered from the Holders page. Move that flow into a dedicated full page, mirroring how "Add consumer account" became its own page.

### Scope

1. **New route file** — `src/routes/app.holders.new.tsx`
   - Path: `/app/holders/new`
   - Admin-only (wrap in `RoleGate allow={["admin"]}`)
   - Renders a full-page form (no Dialog) with the same fields as `NewHolderDialog`:
     - Holder details: canonical name, holder type (Individual/Business), phone, email
     - Linked currency accounts builder: currency, nature, display name, alias; "Add" stages a row; staged rows shown in a list with remove buttons
   - Submit calls the existing `create_holder_with_accounts` RPC (same payload as the dialog)
   - On success: toast, invalidate `holders.list` + `holders.summary`, then navigate to `/app/holders/$id` for the new holder
   - "Cancel" / back link returns to `/app/holders`
   - Uses `PageHeader` for consistent page chrome and existing UI primitives (Card, Input, Label, Select, Badge, Button)

2. **Update Holders index** — `src/routes/app.holders.index.tsx`
   - Replace the `<NewHolderDialog />` action in `PageHeader` with a `Button` linking to `/app/holders/new` (icon: `UserPlus`, label: "New holder")
   - Keep admin-only gate (`isAdmin`)

3. **Retire the dialog component**
   - Delete `src/components/app/new-holder-dialog.tsx` (no other importers)
   - Verify with a quick grep that nothing else imports it before deletion

### Out of scope

- No DB / RPC changes — reuses `create_holder_with_accounts`
- No changes to the consumer-portal "Add consumer account" page (already separate)
- No changes to the linked-account-on-existing-holder flow (`AddLinkedAccountDialog` stays as a dialog inside the holder detail page since it's a smaller, contextual action)

### Technical notes

- Auth gating: use `RoleGate` like `app.users.new-consumer.tsx` does — no server function involved here, so no `useAuth()` query gating needed (the RPC runs through the standard supabase client with RLS)
- Navigation after success: `useNavigate()({ to: "/app/holders/$id", params: { id: String(data.holder_id) } })` — confirm the RPC return shape includes the new holder id; if it only returns `dahab_account_number` + `accounts_created`, navigate to `/app/holders` instead
- Form state: keep the same shape as the current dialog (single `staged[]` array + `draft` row) for minimal risk
