# Add Arabic Language Support

Add a user-controlled English ⇄ Arabic toggle with full RTL layout support. Because the app has dozens of routes and hundreds of strings, we'll wire the infrastructure end-to-end and translate the highest-traffic surfaces in this pass. Remaining routes can be translated incrementally without further plumbing.

## Scope of this pass

**Infrastructure (everywhere):**
- Language context + `useT()` hook with `en` / `ar` dictionaries
- Persistent choice in `localStorage` (`dahab.lang`)
- Auto-set `<html lang>` and `<html dir="rtl">` so Tailwind logical properties, text alignment, icons, and dropdowns flip correctly
- Use Arabic-friendly font stack (Cairo / Noto Sans Arabic) when `lang=ar`
- Reusable `<LanguageToggle />` pill (EN | عربي) styled to match the gold theme

**Translated surfaces (this pass):**
- Landing page (`/`)
- Login page (`/login`) — all labels, tabs, demo card, errors are wrapped
- App shell (`/app/*`) — sidebar nav labels, header, sign-out
- Portal page (`/portal`)
- Common toast/error wording used by these surfaces

**Out of scope (left in English for now, infra ready):**
- Deep back-office routes (`/app/transactions`, `/app/audit`, `/app/users`, etc.) — these are admin/teller tools with heavy tabular data; translating now would 10x the change size. They'll continue working unchanged and can be translated incrementally by wrapping strings in `t("...")`.
- Mobile teller flow (`/m/*`)
- PDF export contents

## Where the toggle appears

1. Login page — small EN | عربي pill below the form (matches the reference screenshot you uploaded)
2. Landing page header
3. App shell — in the top-right header next to the notification bell
4. Portal page header

## Technical details

**New files:**
- `src/lib/i18n.tsx` — `LanguageProvider`, `useLang()`, `useT()` hook, dictionary loader, RTL side-effects (sets `document.documentElement.lang` + `dir`)
- `src/lib/i18n/en.ts` — English dictionary (flat keys, e.g. `login.welcomeBack`, `nav.dashboard`)
- `src/lib/i18n/ar.ts` — Arabic translations of the same keys
- `src/components/ui/language-toggle.tsx` — the pill component (two variants: `default` for headers, `subtle` for the login footer)

**Edits:**
- `src/routes/__root.tsx` — wrap app in `<LanguageProvider>`; add Cairo font from Google Fonts
- `src/styles.css` — add `--font-arabic` token and an `html[lang="ar"] body { font-family: var(--font-arabic) }` rule; add a few RTL-aware utility tweaks where the existing layout uses physical sides
- `src/routes/login.tsx`, `src/routes/index.tsx`, `src/routes/portal.tsx`, `src/components/app/app-shell.tsx` — wrap visible strings with `t("...")`, add the toggle in the right spots
- `src/components/brand/dahab-mark.tsx` — already shows Arabic; no change needed

**RTL handling:**
- Toggling to Arabic sets `<html dir="rtl">`. Most layout uses Tailwind flex/grid which mirrors automatically.
- Dialogs, sheets (Radix) auto-flip from `dir`.
- A small CSS pass converts a few hard-coded `ml-*` / `mr-*` / `left-*` / `right-*` on the app shell sidebar and header to logical equivalents (`ms-*` / `me-*`) so nothing looks broken in RTL.

**Dictionary shape:**
```ts
// src/lib/i18n/en.ts
export const en = {
  "common.signIn": "Sign in",
  "common.signOut": "Sign out",
  "login.welcomeBack": "Welcome back",
  "login.subtitle": "Sign in to the back-office, or create a new account to request access.",
  "nav.dashboard": "Dashboard",
  // ...
};
```
`useT()` returns a function `t(key) → string` that falls back to the key itself if a translation is missing — so untranslated strings degrade gracefully rather than breaking.

## What you'll see after approval

- A clear EN | عربي pill on the login page, landing page, and inside the app header
- Switching to Arabic instantly flips the layout to RTL, swaps the font to Cairo, and translates all strings on those surfaces
- The choice persists across sessions and page reloads
- Untranslated admin pages will still render in English with a correct RTL mirror — they remain fully functional and can be translated next

Approve to implement.
