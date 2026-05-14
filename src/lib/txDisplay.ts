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
type TxDisplaySource = {
  tx_number?: string | number | null;
  txNumber?: string | number | null;
  source_entry_code?: string | number | null;
  sourceEntryCode?: string | number | null;
  source_entry_number?: string | number | null;
  entry_code?: string | number | null;
  entryCode?: string | number | null;
  source_cash_entry_code?: string | number | null;
  sourceCashEntryCode?: string | number | null;
  source_cash_entry_number?: string | number | null;
  cash_entry_code?: string | number | null;
  cashEntryCode?: string | number | null;
};

function cleanCode(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function sourceEntryCode(r: TxDisplaySource | null | undefined): string | null {
  return (
    cleanCode(r?.source_entry_code) ??
    cleanCode(r?.sourceEntryCode) ??
    cleanCode(r?.source_entry_number) ??
    cleanCode(r?.entry_code) ??
    cleanCode(r?.entryCode)
  );
}

export function sourceCashEntryCode(r: TxDisplaySource | null | undefined): string | null {
  return (
    cleanCode(r?.source_cash_entry_code) ??
    cleanCode(r?.sourceCashEntryCode) ??
    cleanCode(r?.source_cash_entry_number) ??
    cleanCode(r?.cash_entry_code) ??
    cleanCode(r?.cashEntryCode)
  );
}

function originalCodeFromGeneratedTxNumber(r: TxDisplaySource | null | undefined): string | null {
  const tx = cleanCode(r?.tx_number ?? r?.txNumber);
  if (!tx) return null;
  const almMatch = tx.match(/^ALM-(\d+)(?:-|$)/i);
  return almMatch?.[1] ?? null;
}

export function displayTxNumber(r: TxDisplaySource | null | undefined): string {
  return (
    sourceEntryCode(r) ??
    sourceCashEntryCode(r) ??
    originalCodeFromGeneratedTxNumber(r) ??
    cleanCode(r?.tx_number ?? r?.txNumber) ??
    ""
  );
}

/** True when the internal tx_number differs from the displayed code. */
export function hasInternalRef(r: TxDisplaySource | null | undefined): boolean {
  const display = displayTxNumber(r);
  const txNumber = cleanCode(r?.tx_number ?? r?.txNumber);
  return !!txNumber && display !== "" && display !== txNumber;
}