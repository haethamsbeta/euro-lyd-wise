# Bring the luxury gold look to every page

Right now the new "luxury gold-on-ivory" mockup style only lives in the `/m` mobile prototype. The rest of the app — landing page, staff login, customer portal, and the entire back-office (Dashboard, Transactions, Accounts, Vaults, Approvals, Audit, Users, Notifications) — is still on the **dark obsidian** theme. This plan unifies the whole app under the new design system without breaking any functionality.

## 1. Theme switch — light cream + gold (one source of truth)

Edit **`src/styles.css`** so the **default theme is the cream-and-gold light look** (matching the mockup palette: `#FAF7F0` cream bg, `#FFFFFF` ivory cards, `#E8DFD0` borders, `#1F1F1F` charcoal text, `#6B6B6B` muted, `#D4AF37` luxury gold, `#B98216` deep gold, `#198754` success).

- Remove the forced `class="dark"` on `<html>` in `src/routes/__root.tsx`.
- Keep the `.dark` block in `styles.css` available, but the app no longer applies it. (Saves it for a future toggle.)
- Update gradient/shadow tokens (`--gradient-gold`, `--shadow-gold`, `--shadow-elegant`, `--gradient-vault`, `card-luxe`) so they look right on the light cream background instead of obsidian — softer warm shadows, hairline beige borders, champagne highlights.
- Keep Playfair (serif), Inter (sans), Amiri (Arabic) — already loaded.

This single change re-skins everything that uses `bg-background`, `bg-card`, `text-muted-foreground`, `border`, etc. — i.e. all shadcn components and every existing page — at once.

## 2. Re-tune brand utilities

In `src/styles.css`:
- `gold-text` → uses the new luxury-gold gradient (`#E8C766 → #D4AF37 → #B98216`) instead of the dark-mode one.
- `card-luxe` → ivory (`#FFFFFF`) base with hairline beige border and faint gold rim glow on top edge (matches the balance/account cards in the mockup).
- New `surface-cream` utility for page-level wrappers (`#FAF7F0` with subtle gold wave at the bottom).
- `shadow-elegant` → softer warm shadow appropriate for a light surface.

## 3. App shell (back-office) redesign — `src/components/app/app-shell.tsx`

Currently a dark sidebar. Convert to:
- Ivory page background, fixed left **rail sidebar** with a gold-accented active state (gold pill behind the active nav item, gold left bar).
- Top header: ivory bar, hairline gold under-rule, breadcrumb in serif, notification bell with gold badge, user chip with avatar + role badge.
- Mobile: bottom nav stays (already done), restyled to ivory with the gold pill active state.
- The `DahabMark` / `DahabCoin` brand elements already exist — they read fine on light too, just verify contrast.

## 4. Per-page restyle (back-office)

Same pattern for each, keeping all logic and queries identical:

| File | What changes |
|---|---|
| `src/routes/app.index.tsx` (Dashboard) | KPI cards become ivory `card-luxe` tiles; the headline KPI gets the gold gradient card treatment from the mobile mockup; charts re-tinted to gold/champagne. |
| `src/routes/app.transactions.index.tsx` | Ivory table card, gold zebra hover, status badges restyled (posted = green `#198754`, pending = champagne, rejected = warm red). |
| `src/routes/app.transactions.new.*` + `entry-form.tsx` | Cream form sections with gold step numbers, gold-gradient primary submit, soft warning bar for "needs approval". |
| `src/routes/app.approvals.tsx` | Each pending row in an ivory card with a gold left bar; Approve = gold gradient, Reject = outlined warm red. |
| `src/routes/app.accounts.index.tsx` + `app.accounts.$id.tsx` | Account list as ivory rows with gold avatars; detail page balance summary in the gold-gradient balance card style from the mobile dashboard. |
| `src/routes/app.vaults.tsx` | Vault tiles styled like premium safe-deposit cards (ivory + gold rim, channel icon in a cream square). |
| `src/routes/app.audit.tsx` | Timeline-style list, gold dots, ivory cards. |
| `src/routes/app.users.tsx` | Ivory table, role chips colored: admin = deep gold, teller = champagne, auditor = warm beige, customer = neutral. |
| `src/routes/app.settings.notifications.tsx` | Cream sections, gold switches (Tailwind class on the existing Switch). |
| `src/routes/app.me.activity.tsx` | Ivory activity feed with gold timestamps. |

No data, RLS, or RPC code is touched in any of these — only JSX classes / wrapper structure.

## 5. Staff login + landing + portal

- **`src/routes/login.tsx`** — replace the dark "card-luxe on obsidian" look with the same ivory card + gold-gradient `Sign In` from the `/m/login` mockup. Demo-role chips get a softer beige/gold look. Functionality (Supabase auth, signup tab, role display) unchanged.
- **`src/routes/index.tsx`** — convert the landing hero from dark to cream, keep the same copy and CTAs, restyle the three "pillar" cards to ivory with gold rims.
- **`src/routes/portal.tsx`** — customer portal gets the same gold-gradient balance card per account + ivory ledger table.

## 6. Mobile prototype (`/m/*`)

Already on the new look — leave as-is. Once the global theme is light, the explicit overrides inside the `/m` shell can be simplified (lower priority — keep them for now so it stays pixel-stable).

## 7. New pages added by this plan

The mockup mentions a few sections that don't yet exist anywhere. Add these as **back-office pages**, styled in the new system:

- **`/app/cards`** — issued bank cards list (mock data for now, since there's no `cards` table). Premium card visuals (gold gradient card faces with the Dahab watermark).
- **`/app/transfers`** — convenience shortcut page that funnels into "New transaction → withdraw + bank channel" with a friendlier consumer-style form. Pure UI sugar over the existing RPC.
- **`/app/bills`** and **`/app/topup`** — placeholder pages with "Coming soon" empty states styled in the luxury system, so the bottom-nav quick actions on the mobile dashboard have real destinations when you tap them on desktop.

These are additive only — no schema changes.

## What is NOT changed

- No database migrations, no RLS edits, no RPC changes, no auth logic changes.
- All existing routes keep their URLs.
- All Supabase queries and mutations stay byte-identical.
- The dark theme block in CSS is preserved (commented why) for an optional future "Dark vault" toggle.

## Order of execution after approval

1. Re-tune `src/styles.css` + remove `dark` from `__root.tsx` (instant global re-skin).
2. Redesign `app-shell.tsx` (sidebar + header).
3. Walk through each back-office route and tighten the JSX classes.
4. Restyle landing, staff login, portal.
5. Add the new `/app/cards`, `/app/transfers`, `/app/bills`, `/app/topup` placeholder pages.
6. Visual QA at desktop + mobile widths on each route.

End result: one consistent gold-and-ivory luxury identity across **every** screen — landing, login, portal, full back-office, and the mobile consumer app — with zero functional regressions.