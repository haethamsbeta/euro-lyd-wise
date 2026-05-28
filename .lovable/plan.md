## Goal

Bring every user-facing exported file in line with the new receipt design (deep onyx hero, gold accents, ivory body, DAHAB logo + wordmark, IBM Plex Arabic for Arabic text). No backend or data-shape changes — purely presentation of the generated files.

## Scope

Two kinds of exports exist today:

1. **PDF tables** — `src/components/app/export-pdf.tsx` (used by the Transactions list and the Audit log). Currently a plain helvetica title + dark-gray autoTable. This is the main upgrade target.
2. **CSV ledgers** — raw `.csv` files generated in `app.accounts.$id.tsx`, `portal.$accountId.$currency.tsx`, and `portal.tsx`. CSV is a data format and cannot carry the brand visual; we keep the CSV as-is but add a matching **branded PDF statement** button next to it so consumers get the on-brand option.

## Changes

### 1. Re-skin `ExportPdfButton` (PDF table export)

File: `src/components/app/export-pdf.tsx`.

- Lazy-load the same brand assets the receipt uses: `/brand/dahab-icon.png` logo + IBM Plex Sans Arabic font (regular + bold). Reuse the same `fetchAsBase64` + `ensureArabicFont` helpers — extract them from `receiptPdf.ts` into a shared `src/lib/pdfBrand.ts` so both exporters share one cached font + logo loader.
- Build a **branded header band** (deep onyx slab, gold hairline, DAHAB logo on the left, spaced gold wordmark + "FINANCIAL SERVICES · {title}" tagline) instead of the current plain title text.
- Right side of the header: a gold-ringed status pill showing the date range, plus a small "Generated …" timestamp underneath — same visual language as the receipt's status pill.
- Body sits on the ivory page background; the table is wrapped by a soft sand-bordered rounded card with a thin gold accent bar on the leading edge (mirrors the receipt's "Transaction Details" card).
- `autoTable` styling:
  - `headStyles`: onyx fill `[20,24,31]`, gold text `[212,168,87]`, bold, tracked-out small caps.
  - `bodyStyles`: ivory text, 9pt, line-height tuned for Arabic.
  - `alternateRowStyles`: faint ivory tint `[250,247,239]`.
  - `theme: "grid"` with sand-toned border color `[228,217,188]`.
  - Per-cell `didParseCell` hook detects Arabic via the receipt's `ARABIC_RE`, switches that cell's font to `NotoArabic`, and sets `halign: "right"` so Arabic customer names/notes shape and align correctly (fixes the same garbled-glyph class of bug already solved in the receipt).
- Footer band: onyx strip with gold hairline at top, "DAHAB" wordmark left, "Page X of Y" right, and the existing disclaimer line.
- Filename stays as `${filenamePrefix}_${from}_to_${to}.pdf`. Public props (`title`, `filenamePrefix`, `columns`, `buildRows`, `buildSummary`) are unchanged — every call site (transactions list, audit log) keeps working with zero changes.

### 2. Add branded PDF statement to consumer-account ledger exports

Files: `src/routes/portal.$accountId.$currency.tsx`, `src/routes/portal.tsx`, `src/routes/app.accounts.$id.tsx`.

- Keep the existing **Export CSV** button untouched (raw data export for spreadsheets).
- Add a second **Export PDF** button right next to it, which calls `ExportPdfButton` (the now-branded component) with appropriate columns (TX #, Date, Type, Channel, Currency, Amount, Status, Comment) and a `title` like `"DAHAB Account Statement — {accountName} ({currency})"`. This gives consumers the same on-brand visual they see on the shared receipt.
- For `app.accounts.$id.tsx` the existing CSV button also stays; we just add the branded PDF alongside it.

### 3. Shared brand module

New file: `src/lib/pdfBrand.ts`.

- Exports the `BRAND` palette, `ARABIC_RE` / `hasArabic`, `ensureArabicFont`, `loadLogo`, and a small `drawBrandHeader(doc, { title, subtitle, statusPill? })` + `drawBrandFooter(doc, { pageWidth, pageHeight })` helper.
- `receiptPdf.ts` is refactored to import from this module (no visual change to receipts — same constants, same draws).
- `export-pdf.tsx` imports from this module too. Single source of truth for brand colors and font registration.

## Non-goals

- No change to which rows are exported, which fields, sort order, or filenames.
- No change to CSV contents or filename — CSV is a raw data export and stays exactly as-is.
- No change to share/download mechanics, route structure, or any backend call.
- Receipt PDF visual stays exactly as it is today (only its internals are refactored to consume `pdfBrand.ts`).

## Technical notes

- jsPDF + jspdf-autotable are already lazy-loaded in `ExportPdfButton`; we keep that pattern so the brand assets only land on pages that actually export.
- IBM Plex Sans Arabic font files already exist in `public/fonts/` — no new assets to ship.
- `didParseCell` runs before layout, so setting `cell.styles.font = "NotoArabic"` for Arabic cells correctly switches font during measurement and avoids the "rabish letters" issue users hit on the receipt.
- Verification: build/typecheck after the change, then generate a Transactions PDF and an Audit PDF (mixed Arabic + Latin rows) and confirm logo, gold accents, status pill, footer, and Arabic glyph shaping all render correctly.
