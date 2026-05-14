/**
 * Frontend-only helper: pick the user-facing TX number for display.
 *
 * The backend stores both an internal generated reference (`tx_number`,
 * e.g. ALM-7388-3C7A01A0) and the user-facing accounting code
 * (`display_tx_number`, sourced from AlMizan_Cloud.dbo.Entry.Code when
 * imported). Users recognize the accounting code; the internal one is
 * only meaningful to engineers.
 *
 * This helper does NOT mutate the row — it only computes what to render.
 * Use the original `tx_number` field for any backend call (correction,
 * reversal, idempotency, deep-links).
 */
type TxDisplaySource = {
  tx_number?: string | number | null;
  txNumber?: string | number | null;
  system_tx_number?: string | number | null;
  systemTxNumber?: string | number | null;
  display_tx_number?: string | number | null;
  displayTxNumber?: string | number | null;
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

export function displayTxNumber(r: TxDisplaySource | null | undefined): string {
  return (
    cleanCode(r?.display_tx_number) ??
    cleanCode(r?.displayTxNumber) ??
    sourceEntryCode(r) ??
    sourceCashEntryCode(r) ??
    cleanCode(r?.tx_number ?? r?.txNumber) ??
    ""
  );
}

/** Return the original system-generated tx reference (e.g. ALM-7388-3C7A01A0). */
export function systemTxNumber(r: TxDisplaySource | null | undefined): string | null {
  return (
    cleanCode(r?.system_tx_number) ??
    cleanCode(r?.systemTxNumber) ??
    cleanCode(r?.tx_number ?? r?.txNumber)
  );
}

/**
 * Normalize a backend row for user-facing rendering:
 *  - preserves the original system reference as `system_tx_number`
 *  - sets `display_tx_number` from the priority chain
 *  - keeps `tx_number` as the backend-provided system reference
 *
 * Backend identifiers (`id`) and all other fields are left untouched —
 * correction/reversal/idempotency continue to use `id`.
 */
export function normalizeTxRow<T extends TxDisplaySource>(
  r: T,
): T & {
  system_tx_number: string | null;
  display_tx_number: string;
  source_entry_code: string | null;
  source_cash_entry_code: string | null;
  tx_number: string;
} {
  const sys = systemTxNumber(r);
  const display = displayTxNumber(r);
  const rawTx = cleanCode(r?.tx_number ?? r?.txNumber) ?? (sys ?? "");
  return {
    ...(r as object),
    system_tx_number: sys,
    source_entry_code: sourceEntryCode(r),
    source_cash_entry_code: sourceCashEntryCode(r),
    display_tx_number: display || rawTx,
    tx_number: rawTx,
  } as T & {
    system_tx_number: string | null;
    display_tx_number: string;
    source_entry_code: string | null;
    source_cash_entry_code: string | null;
    tx_number: string;
  };
}

/** True when the internal system reference differs from the displayed code. */
export function hasInternalRef(r: TxDisplaySource | null | undefined): boolean {
  const display = displayTxNumber(r);
  const sys = systemTxNumber(r);
  return !!sys && display !== "" && display !== sys;
}