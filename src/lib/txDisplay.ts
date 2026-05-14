/**
 * Frontend-only helper: pick the user-facing TX number for display.
 *
 * The backend stores both an internal generated reference (`tx_number`,
 * e.g. ALM-7388-3C7A01A0) and the original accounting code from the
 * source ledger (`source_entry_code` / `source_cash_entry_code`,
 * mirrored from AlMizan_Cloud.dbo.Entry.Code). Users recognize the
 * accounting code; the internal one is only meaningful to engineers.
 *
 * This helper does NOT mutate the row — it only computes what to render.
 * Use the original `tx_number` field for any backend call (correction,
 * reversal, idempotency, deep-links).
 */
export function displayTxNumber(r: {
  tx_number?: string | null;
  source_entry_code?: string | number | null;
  source_cash_entry_code?: string | number | null;
}): string {
  const code =
    r?.source_entry_code ??
    r?.source_cash_entry_code ??
    r?.tx_number ??
    "";
  return code === null || code === undefined ? "" : String(code);
}

/** True when the internal tx_number differs from the displayed code. */
export function hasInternalRef(r: {
  tx_number?: string | null;
  source_entry_code?: string | number | null;
  source_cash_entry_code?: string | number | null;
}): boolean {
  const display = displayTxNumber(r);
  return !!r?.tx_number && display !== "" && display !== String(r.tx_number);
}