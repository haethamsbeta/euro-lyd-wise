import { cn } from "@/lib/utils";

/**
 * Small uppercase currency pill — matches the mockup's CurrencyBadge.
 * Each currency gets its own subtle tinted background + border:
 *   LYD → gold      USD → emerald
 *   EUR → blue      GBP → lavender
 */
const STYLES: Record<string, string> = {
  LYD: "bg-[oklch(from_var(--gold)_l_c_h/0.15)] text-gold border-[oklch(from_var(--gold)_l_c_h/0.30)]",
  USD: "bg-[oklch(from_var(--success)_l_c_h/0.10)] text-[var(--success)] border-[oklch(from_var(--success)_l_c_h/0.30)]",
  EUR: "bg-[#7AA8E8]/10 text-[#7AA8E8] border-[#7AA8E8]/25",
  GBP: "bg-[#C394E0]/10 text-[#C394E0] border-[#C394E0]/25",
};

export function CurrencyBadge({
  currency,
  className,
}: {
  currency: string;
  className?: string;
}) {
  const c = (currency ?? "").toUpperCase();
  const style = STYLES[c] ?? "bg-[oklch(from_var(--gold)_l_c_h/0.10)] text-gold border-[oklch(from_var(--gold)_l_c_h/0.20)]";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wider border",
        style,
        className,
      )}
    >
      {c || "—"}
    </span>
  );
}