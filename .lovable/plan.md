## Goal

Polish the consumer account PDF exports (the two on the customer portal) so the customer sees their **name** clearly, the **date range** is legible inside the brand layout, Arabic text shapes correctly everywhere (not just inside the table), and rows never get clipped. Keep the existing DAHAB onyx + gold design — this is a clarity pass, not a redesign.

## Scope (consumer exports only)

- `src/routes/portal.tsx` — per-account PDF inside `PortalAccountCard` (the expandable account card on the customer dashboard).
- `src/routes/portal.$accountId.$currency.tsx` — the dedicated account statement page export.

Back-office (`app.transactions.index.tsx`, `app.accounts.$id.tsx`) and receipts are out of scope.

## What the user will see

A consumer statement PDF will open with:

1. The brand onyx hero band (unchanged).
2. A new **"Account Holder" info card** directly under the header showing, on two clean rows:
   - Holder name (Arabic-safe), Account name (Arabic-safe)
   - Account number, Currency, Date range (`12 Jan 2026 → 28 May 2026`), Generated timestamp
3. The summary line (records / debits / credits / net) — kept, but reformatted to one row that wraps cleanly.
4. The transactions table — same look, but with column widths re-tuned so Description / Comment never clip and Date fits on one line.
5. The status pill in the header is shortened to just the date range (no overlap with subtitle).

## Technical changes

### 1. `src/lib/pdfBrand.ts`

- Add a small helper `drawTextSmart(doc, text, x, y, opts)` that switches the active font to `ARABIC_FONT` and right-aligns when `hasArabic(text)` is true, otherwise uses the current Helvetica font. Use it for the header title fragments, account-info card values, and the summary line so Arabic holder names render correctly (today only table cells do).
- Add a new `drawInfoCard(doc, { items, x, y, width })` helper that paints an ivory rounded card with `label / value` pairs in two columns. Items use `drawTextSmart` for the value.
- Format helper `formatDateRange(fromISO, toISO)` returning `"12 Jan 2026  →  28 May 2026"` (locale-aware, short month).

### 2. `src/components/app/export-pdf.tsx`

- Extend `PdfExportProps` with an optional `infoItems?: Array<{ label: string; value: string }>` (rendered in the new info card under the header).
- In `handleExport`:
  - Replace the title-only subheading with the new `drawInfoCard` call when `infoItems` is provided. Reserve ~80pt for it and push `tableTop` accordingly.
  - Use `formatDateRange(from, to)` for the header pill and shorten/elide if it would overflow (cap pill width to ~220pt).
  - Call `drawTextSmart` for the title and summary text so Arabic flows correctly.
  - Bump `autoTable` `margin.top` to `headerH + infoCardH + 20` and keep the existing `willDrawPage` repaint so page 2+ also reserve the same area (info card repeats too).
  - Recompute default column widths: give Description / Comment the remaining width, cap Date at 110pt, Amount/Balance at 90pt, so wrapping isn't needed.

### 3. `src/routes/portal.$accountId.$currency.tsx`

- Pass `infoItems` to `<ExportPdfButton>`:
  - `Account Holder` → `data?.acc?.name` (Arabic-safe via `drawTextSmart`)
  - `Account #` → `data?.acc?.account_number`
  - `Currency` → `currency`
  - `Statement Period` → handled by header pill, but also shown here for clarity.
- Keep `buildRows` / `buildSummary` as-is.

### 4. `src/routes/portal.tsx` (`PortalAccountCard`)

- Pass `infoItems` to `<ExportPdfButton>`:
  - `Account Holder` → `holder.canonical_name` (need to thread `holderName` prop down from `Portal` into `PortalAccountCard`).
  - `Account Name` → `account.account_display_name`
  - `Account #` → `account.account_number`
  - `Currency` → `account.currency_code`
- Add `holderName?: string` to `PortalAccountCard` props and pass it from `accounts.map(...)` in `Portal`.

## Verification

- Open `/portal` → expand an account → Export PDF → confirm:
  - Account holder name is visible at the top, in Arabic where applicable.
  - Date range is fully visible inside the gold pill (no clipping) and repeated in the info card.
  - All transactions render; no row clipping in Description.
- Open `/portal/:accountId/:currency` → Export PDF → same checks.
- Back-office PDF exports continue to compile and look identical (they don't pass `infoItems`, so the info card is simply not drawn).
