# Make Transactions page clearer for admin review + inline file viewer

(Note: "sudoters" → admins/auditors reviewing entries.)

## Goals

1. Make the Transactions list **easier to scan** for reviewers — clearer grouping, better status hierarchy, customer name visible, attachment indicator at a glance.
2. Let admins/auditors **review uploaded files inline** on the same page — no need to open the entry form.

## Changes

### 1. `src/routes/app.transactions.index.tsx` — readability pass

**Query updates** (single round trip, no new server code):
- Pull customer name with the embedded select: `customer:accounts!transactions_customer_account_id_fkey(name, account_number)`. If the relationship name lookup fails, fall back to a separate batched fetch by `customer_account_id`.
- Pull attachment count via `transaction_attachments(count)` so the row knows whether a paperclip should appear.

**Visual / structural changes**:
- Group the rows by **date header** ("Today", "Yesterday", `Apr 28, 2026`) inserted as full-width subheader rows, so reviewers can scan a day at a time.
- Add a left-edge **status accent bar** per row (color-coded: pending=amber, posted=neutral, rejected=red, reversed/reversal=muted warning) so status is obvious without reading the badge.
- Reorder columns for review-first scanning:
  `TX #` · `Time` · `Customer` · `Direction` (icon + word) · `Channel` · `Amount` (right-aligned, larger, currency suffixed) · `Status` · `Files` · `Comment` (truncated, full text in a tooltip) · `Actions`
- **Direction** shown as a colored pill with arrow icon (↓ green deposit, ↑ red withdraw) instead of plain text.
- **Amount** in tabular-nums, slightly bigger, with currency code dimmed after the number.
- **Files column**: paperclip icon + count; clicking it opens the new inline preview drawer (see #2). Empty state shows a muted dash.
- **Reversal chain**: if `reverses_tx_id` is set, show a small "↩ reverses TX-…" subtext under the TX number; if `corrected_by_tx_id` is set on a reversed entry, show "→ corrected by TX-…". Reviewers immediately see the audit chain.
- **Filters** above the table (in addition to the existing TX# search):
  - Status: All / Pending / Posted / Rejected / Reversed (segmented control)
  - Direction: All / Deposit / Withdraw
  - Has files: toggle
- **Sticky table header** so columns stay visible while scrolling.
- **Empty / loading / error states** keep the friendlier messaging from the previous fix; loading uses skeleton rows instead of a single "Loading…" cell.
- **Density**: slightly tighter row padding and zebra striping on hover for fast row-by-row review.

No design-token violations — colors come from existing semantic tokens (`success`, `destructive`, `warning`, `muted-foreground`, etc.).

### 2. Inline attachment review — new `AttachmentsSheet` component (same file)

Triggered by clicking the paperclip in the Files column. Opens a side **Sheet** (right-side drawer) so the table stays visible behind it.

Contents:
- Header: TX number, customer name, amount, status badge.
- List of attachments for that transaction (queried on open):
  - File name, content-type icon (image / PDF / generic), size.
  - **Inline preview**:
    - Images render directly via signed URL (60 s TTL, refreshable).
    - PDFs render in an `<iframe>` at full sheet height.
    - Other types show a "Download" button only.
  - "Open in new tab" and "Download" actions per file (signed URL).
- Read-only — no upload/delete here. (Editing files stays in the entry form, consistent with the immutable-ledger model.)
- Uses existing `tx-attachments` bucket and existing RLS policy `tx_attach read` (admins/auditors/tellers/owner already have read access). No DB changes.

### 3. Permissions / safety

- **No new RLS, no schema migration, no new RPC.** All data is already readable per existing policies.
- Admin-only "Edit" (correction) action stays exactly as today and remains the only mutation path.
- Signed URLs are short-lived (60 s) and re-issued on demand; nothing is made public.

## Files touched

- `src/routes/app.transactions.index.tsx` — list redesign, filters, date grouping, `AttachmentsSheet` component.
- (Possibly) `src/components/ui/sheet.tsx` — already present in shadcn; just import.

## Out of scope

- No changes to the entry form, accounts page, attachments table, storage bucket, or correction RPC.
- No bulk approve/reject (can be a follow-up if useful).
