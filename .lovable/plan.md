## Plan

### 1. Floating top toolbar (replaces sidebar)

**File:** `src/components/app/app-shell.tsx`

- Remove the desktop `<aside>` sidebar entirely.
- Replace top bar with a sticky **floating toolbar** centered near the top:
  - Premium glass pill (`premium-surface`, gold-rimmed, rounded-full, shadow, slight backdrop blur).
  - Left: DAHAB coin + wordmark.
  - Center: 5 most-important nav links shown as chips with gold active state:
    1. Dashboard (`/app`)
    2. New Transaction (`/app/transactions/new`)
    3. Transactions (`/app/transactions`)
    4. Holders (`/app/holders`)
    5. Approvals (`/app/approvals`) — admin only; falls back to Vaults otherwise
  - Right: Notification bell, Language, Theme, Account avatar, and a **3-dots (`MoreHorizontal`) menu** containing every remaining nav item (Vaults, Groups, My Activity, Audit, Reports, Users, **Customer Portal Accounts**, Notifications settings, Security, About).
- Mobile: same floating bar but only logo + 3-dots menu (full nav inside the menu).
- The `<main>` is no longer flex-side-by-side — it's a single column with top padding to clear the floating bar.

### 2. Customer Portal Accounts page

**New file:** `src/routes/app.portal-accounts.tsx`

- Route: `/app/portal-accounts`, admin-gated via `RoleGate`.
- PageHeader title: "Customer Portal Accounts", subtitle: "Create consumer logins and link holder accounts to them."
- Lists existing **consumer** users (filter `user_roles.role = 'consumer'`) with:
  - Full name, email, linked holders count, "Manage links" button.
- Top-right primary action: **"Add consumer account"** → links to existing `/app/users/new-consumer` (already implements creation + linking flow).
- "Manage links" opens a dialog reusing the same holder picker logic (search + checkboxes against `account_holders`) and calls existing `add_account_to_holder` / updates `owner_user_id` to relink.
- Add nav entry in the toolbar's 3-dots menu: **Customer Portal Accounts** (`Users` icon).

### 3. Users / Roles page cleanup

**File:** `src/routes/app.users.tsx`

- Remove the long UUID line under each user (`<div className="font-mono text-xs ...">{p.id}</div>`). Keep only `full_name`.
- Remove the trailing `userId.slice(0,8)…` hint inside `GrantRole`.
- Email pencil/icon button: add an `aria-label="Change email"` and a tooltip saying **"Change email"** (wrap in `Tooltip` from `@/components/ui/tooltip`).
- After successful email change, `toast.success("Email updated successfully")` is already present — enhance with description: `Confirmation has been sent to <new_email>.`

### 4. Files touched

- Edit `src/components/app/app-shell.tsx`
- Add `src/routes/app.portal-accounts.tsx`
- Edit `src/routes/app.users.tsx`
- Add i18n key `nav.portalAccounts` to `src/lib/i18n/en.ts` and `ar.ts`

No backend, RLS, or schema changes. No business logic touched.
