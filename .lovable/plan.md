## Goal

Improve the Arabic experience of DAHAB without touching layout, routes, components structure, backend, or enum/status values. Two pillars: **(1) better Arabic wording in the existing dictionary**, and **(2) expanded translation coverage** for screens that currently render hardcoded English. Optional polish: switch the Arabic font from Amiri to a banking‑grade sans (IBM Plex Sans Arabic + Cairo fallback) — typography only, no layout changes.

## Scope (what changes)

Frontend strings + one small CSS font‑token swap. No changes to:
- routes, URLs, navigation order, sidebar structure
- React component trees, props, state, mutations
- backend payloads, endpoints, role names, enum values (`posted`, `pending`, `deposit`, `withdraw`, etc.)
- database, RLS, edge functions
- design tokens, colors, spacing, icons, card layouts

## 1. Refine existing Arabic wording (`src/lib/i18n/ar.ts`)

Apply the banking-standard wording from your guide. Keep keys identical, only change the Arabic value.

| Key | Current AR | Improved AR | Why |
|---|---|---|---|
| `nav.dashboard` | لوحة التحكم | لوحة التحكم | keep |
| `nav.transactions` | المعاملات | المعاملات | keep |
| `nav.accounts` | الحسابات | الحسابات | keep |
| `nav.holders` | أصحاب حسابات دهب | عملاء ذهب | "العملاء" matches market banking Arabic |
| `nav.linkedAccounts` | الحسابات المرتبطة | الحسابات المرتبطة | keep (true linkage) |
| `nav.users` | المستخدمون والأدوار | المستخدمون والصلاحيات | "صلاحيات" is more banking-correct than "أدوار" |
| `nav.audit` | سجل التدقيق | سجل المراجعة | matches bank usage |
| `nav.approvals` | الموافقات | الموافقات | keep |
| `nav.myActivity` | نشاطي | عملياتي | "عملياتي" is more natural in banking |
| `dash.pinnedCustomers` | حسابات العملاء المثبّتة | حسابات العملاء المثبّتة | keep |
| `dash.recentTx` | المعاملات الأخيرة | آخر العمليات | matches Riyad/QNB wording |
| `accounts.title` | الحسابات | حسابات العملاء | clarifies it's customer accounts |
| `accounts.subtitle` | حسابات العملاء والأرصدة. | حسابات العملاء وأرصدتهم. | natural phrasing |
| `accounts.col.nature` | الطبيعة | نوع الحساب | "الطبيعة" is a literal translation; "نوع الحساب" is standard |
| `portal.ledger` | دفتر الحركات | كشف الحساب | Bank-standard term for the statement view |
| `portal.col.tx` | رقم المعاملة | رقم العملية | shorter for table headers |
| `portal.col.type` | النوع | نوع العملية | clearer |
| `portal.col.channel` | القناة | الوسيلة | "الوسيلة" reads more natural than literal "قناة" |
| `activity.col.tx` | رقم المعاملة | رقم العملية | same |
| `users.addMember` | إضافة عضو ذهب | إضافة موظف ذهب | "موظف" is precise for staff |
| `users.subtitle` | تعيين أدوار … | تعيين صلاحيات المسؤول، الصرّاف، المراجع، أو العميل للمستخدمين. | "صلاحيات" |
| `approvals.subtitle` | السحوبات بانتظار مراجعة المسؤول. | عمليات السحب بانتظار اعتماد المسؤول. | "اعتماد" matches bank Arabic |
| `tx.status.posted` | مرحَّل | مُرحَّلة | gender agreement with عملية |
| `tx.status.pending` | معلّق | قيد الاعتماد | clearer banking phrasing |
| `tx.status.rejected` | مرفوض | مرفوضة | agreement |
| `tx.status.reversed` | معكوس | مُعكوسة | agreement |
| `tx.channel.cash` | نقدي | نقداً | natural Arabic |
| `tx.channel.bank` | بنكي | تحويل بنكي | clearer |
| `newtx.deposit` | إيداع | إيداع | keep |
| `newtx.withdraw` | سحب | سحب | keep |
| `vaults.title` | الخزائن | الخزائن | keep |
| `vaults.subtitle` | … الخزائن فقط من خلال المعاملات المرحّلة. | … الخزائن فقط من خلال العمليات المُرحَّلة. | consistency |
| `dash.cashVault` | خزينة النقد | خزينة النقد | keep |
| `dash.bankVault` | خزينة البنك | خزينة البنك | keep |
| `notif.empty` | لا توجد إشعارات جديدة. | لا توجد إشعارات جديدة. | keep |
| `export.button` | تصدير PDF | تصدير PDF | keep (PDF stays LTR) |
| `landing.dahabFamily` | عائلة ذهب | فريق ذهب | "عائلة" is literal; "فريق" is the staff team |

Status values displayed inside `chip` (`posted`, `pending`, etc.) are still rendered raw from the API in `statement-ledger.tsx`. We will NOT change the API enum — instead translate at render time using the existing `tx.status.*` keys (frontend-only; see step 3).

## 2. Expand translation coverage (new keys + wire them up)

These pages currently render hardcoded English. Add new keys to both `en.ts` and `ar.ts`, then replace the literals in JSX with `t("…")`. No structural changes.

Files to translate (string-only edits):
- `src/routes/app.holders.index.tsx` + `app.holders.new.tsx` + `app.holders.$id.tsx` — page titles, table headers, buttons, empty states
- `src/routes/app.transactions.index.tsx` + `app.transactions.$id.tsx` — filters, columns, empty state
- `src/routes/app.audit.tsx` — title, subtitle, columns, filters
- `src/routes/app.reports.tsx` — section headings, KPI labels
- `src/routes/app.groups.index.tsx` + `app.groups.$id.tsx`
- `src/routes/app.users.new.tsx` + `app.users.new-consumer.tsx` — form labels, buttons, toast messages, **including the create error toast**
- `src/routes/app.portal-accounts.tsx`
- `src/routes/app.admin.fx-rates.tsx`, `app.admin.branches.tsx`, `app.admin.test-sandbox.tsx`
- `src/routes/app.settings.notifications.tsx`, `app.settings.security.tsx`, `app.about.tsx`
- `src/routes/change-password.tsx`, `forgot-password.tsx`, `reset-password.tsx`
- `src/components/app/new-transaction-wizard.tsx` — the wizard steps, field labels, confirm screen
- `src/components/app/statement-ledger.tsx` — table headers ("Date & time", "TX #", "Description", "Debit", "Credit", "Status", "Balance after") + status chip text (translate via `tx.status.*`)
- `src/components/app/account-menu.tsx`, `add-linked-account-dialog.tsx`, `currency-totals-strip.tsx`, `kpi-card.tsx`, `bottom-dock.tsx`, `global-search.tsx`, `role-view-switcher.tsx`
- `src/lib/tx-describe.ts` — currently hardcodes English ("Deposit of … for …, awaiting approval"). Convert to a function that takes a `t` (or accepts a language and returns the right template). Used in notifications/audit subtitles.

For each: add a small namespace (`holders.*`, `audit.*`, `reports.*`, `wizard.*`, `ledger.*`, `forms.*`) with both English and Arabic values, then swap literals to `t("namespace.key")`. No JSX restructuring.

## 3. Translate API-driven enum labels at the edge

Don't touch backend values. Add tiny helper:

```ts
// src/lib/format.ts (add)
export function tStatus(t, s) { return t(`tx.status.${s}`); }
export function tChannel(t, c) { return t(`tx.channel.${c}`); }
export function tDirection(t, d) { return t(`tx.direction.${d}`); }
```

Use these wherever raw `status`/`channel`/`direction` strings render (statement ledger, transactions list, activity, dashboard recent tx, notifications). The underlying value in state, filters, mutations, and network payloads stays unchanged.

## 4. Optional typography polish (Arabic font only)

Edit `src/styles.css` only — replace the Amiri override:

```css
--font-arabic: "IBM Plex Sans Arabic", "Cairo", "Segoe UI", Tahoma, sans-serif;

html[lang="ar"] body { font-family: var(--font-arabic); }
html[lang="ar"] .font-serif,
html[lang="ar"] h1,
html[lang="ar"] h2 {
  font-family: var(--font-arabic);   /* drop Amiri */
  letter-spacing: 0;
}
```

Add Google Fonts `<link>` for `IBM+Plex+Sans+Arabic:wght@400;500;600;700` and `Cairo:wght@400;600;700` in `src/routes/__root.tsx` head. No layout/spacing changes; this only swaps the Arabic glyph rendering away from Amiri (which currently makes Arabic feel literary rather than banking).

## 5. Bidi safety for numbers (no UI redesign)

Add one CSS utility in `src/styles.css`:

```css
[lang="ar"] .num, [dir="rtl"] .num {
  direction: ltr;
  unicode-bidi: isolate;
}
```

The `.num` class already exists and is used on amounts/balances; this just makes account numbers, IBANs, currency codes, and amounts always render LTR even inside RTL rows. No structural change.

## Out of scope

- Renaming any backend field, enum, role, or status value
- Changing routes, sidebars, icons, KPI tiles, color tokens
- Switching i18n library (we keep the existing `useT()` / dictionary)
- Touching `src/integrations/supabase/*`, `database/aws/*`, edge functions
- Adding new admin features, redesigning the dashboard, or modifying the wizard flow

## Validation

- Toggle language to Arabic and walk every route in the sidebar; confirm no English strings remain in chrome, tables, dialogs, or toasts.
- Confirm transaction status chips read مُرحَّلة / قيد الاعتماد / مرفوضة / مُعكوسة, but network payloads still send `posted` / `pending` / `rejected` / `reversed`.
- Confirm amounts and account numbers stay LTR inside RTL rows.
- Confirm English mode is unchanged (visual regression check on dashboard, transactions, vaults, approvals, users).
- Build passes (`tsc` via harness).
