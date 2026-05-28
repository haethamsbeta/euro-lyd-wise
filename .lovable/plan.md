## Plan

1. **Make the PDF exporter report accurate summary information**
   - Extend `ExportPdfButton` so each export can return both rows and summary text from the same filtered/exported dataset.
   - Keep existing branded DAHAB PDF design unchanged.
   - Ensure the summary line reflects the actual rows exported, not just a generic or stale count.

2. **Fix all-transaction PDF exports to include every row in the selected date range**
   - Update the main Transactions export to page through backend results instead of stopping at the current `5000` row cap.
   - For the current database fallback path, request the selected date range in chunks so the export is not limited to one loaded UI page.
   - Preserve current columns and formatting.

3. **Fix consumer account PDF exports that show no information**
   - Stop building consumer PDFs from the already-filtered visible list plus a second date filter, because that can double-filter rows and produce empty PDFs.
   - Fetch/build export rows directly for the selected PDF date range.
   - Add summary text such as: row count, total credits, total debits, and net movement for that exported range.

4. **Update consumer CSV button styling only**
   - Restyle the CSV buttons next to the PDF buttons to visually match the new DAHAB export controls.
   - Keep CSV file content unchanged unless it is currently using the wrong filtered dataset.

5. **Verification**
   - Verify all `ExportPdfButton` call sites still compile with the enhanced API.
   - Check the export builders cover: main transactions, back-office account ledger, consumer portal account cards, dedicated consumer ledger page, and audit log.