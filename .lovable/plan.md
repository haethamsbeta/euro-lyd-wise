# Fix Arabic in Shared Receipt PDF

## Problem
`src/lib/receiptPdf.ts` builds the receipt with jsPDF's built-in `helvetica` font. Helvetica is a Latin-1 font with no Arabic glyphs, so any Arabic content (customer name, account name, notes/comment, vault name, Arabic tagline) renders as garbled boxes/Latin substitutes. jsPDF also does not shape or reorder RTL text on its own.

## Goal
Arabic strings inside the shared PDF receipt render as proper, correctly-shaped, right-to-left Arabic — while the rest of the receipt (layout, colors, English text, share/download flow) stays exactly as it is today.

## Approach
Keep the current jsPDF vector layout (so text remains selectable, file size stays small, no DOM capture). Add a Unicode font with Arabic coverage and an RTL shaper, and route any field that may contain Arabic through a small helper.

### 1. Bundle an Arabic-capable font
- Add a Noto Naskh Arabic (regular + bold) TTF under `public/fonts/` (or `src/assets/fonts/`).
- At PDF build time, `fetch()` the TTF (mirroring the existing `loadLogo()` pattern), base64-encode it, and register with `doc.addFileToVFS()` + `doc.addFont(..., "NotoArabic", "normal"|"bold")`. Cache the encoded data in a module-level variable like `cachedLogo`.
- Keep `helvetica` as the default for Latin text; only switch to `"NotoArabic"` for strings detected as Arabic.

### 2. Shape + reorder RTL text
- Add `bidi-js` (or equivalent) and a lightweight Arabic presentation-forms shaper so isolated code points become their correct contextual forms before jsPDF draws them.
- Helper `drawText(doc, value, x, y, opts)` that:
  1. Detects Arabic via `/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/`.
  2. If Arabic: switch font to `NotoArabic`, run the shaper + bidi, draw with `{ align: "right", ... }` anchored to the right edge of the field's bounding box.
  3. If Latin: current behavior unchanged.
- Update `valueText`, `detailRow`, the tagline line, and the notes block to go through this helper. Labels stay Latin/uppercase as today.

### 3. Field coverage
Fields most likely to contain Arabic and that must be routed through the helper:
- `customerName`, `accountName`, `vaultName`, `channel`
- `comment`, `reason` (notes card body — also needs `splitTextToSize` with the Arabic font active so wrapping measures correctly)
- The decorative tagline under the wordmark (optional: render the real Arabic "ذهب" instead of the all-caps Latin tagline)

### 4. Non-goals / guardrails
- No change to layout, colors, card structure, share/download behavior, or the `ReceiptPdfData` shape.
- No switch to `html2canvas` (would break text selection and bloat the PDF).
- No change to in-app UI rendering — only the generated PDF.

## Files to touch
- `src/lib/receiptPdf.ts` — font loader, RTL helper, route Arabic-capable fields through it.
- `public/fonts/NotoNaskhArabic-Regular.ttf` (+ Bold) — new asset.
- `package.json` — add `bidi-js` (and a small Arabic shaper, e.g. `arabic-persian-reshaper`).

## Verification
- Generate a receipt for a customer whose name/notes are Arabic; confirm glyphs are joined correctly and right-aligned within their field.
- Mixed Arabic + Latin in the notes card wraps cleanly inside the card width.
- English-only receipts look identical to today.
- PDF text remains selectable/copyable.
