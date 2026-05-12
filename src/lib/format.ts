export function formatMinor(amountMinor: number | null | undefined, currency: string) {
  const n = (amountMinor ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/* ------------------------------------------------------------------
 * Localized labels for backend-driven enums.
 * The backend value (e.g. "posted") is never mutated — these helpers
 * only translate the visible label using the existing i18n dictionary
 * keys: tx.status.*, tx.channel.*, tx.direction.*.
 * ------------------------------------------------------------------ */
type TFn = (key: string) => string;
export function tStatus(t: TFn, status: string | null | undefined): string {
  if (!status) return "—";
  return t(`tx.status.${status}`);
}
export function tChannel(t: TFn, channel: string | null | undefined): string {
  if (!channel) return "—";
  return t(`tx.channel.${channel}`);
}
export function tDirection(t: TFn, direction: string | null | undefined): string {
  if (!direction) return "—";
  return t(`tx.direction.${direction}`);
}

/** Allowed currencies in DAHAB. Anything else is treated as missing. */
export const ALLOWED_CURRENCIES = ["LYD", "USD", "EUR", "GBP"] as const;

/**
 * Format an amount when currency is known and valid. When the currency is
 * missing or not in the allow-list, return the literal "Currency missing"
 * sentinel so the UI can render a clear data-issue badge instead of falling
 * back to USD or "UNK".
 */
export function formatMinorOrMissing(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (!currency || !(ALLOWED_CURRENCIES as readonly string[]).includes(currency)) {
    return "Currency missing";
  }
  return formatMinor(amountMinor, currency);
}

export function parseAmountToMinor(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[, _]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}