export function formatMinor(amountMinor: number | null | undefined, currency: string) {
  const n = (amountMinor ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
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