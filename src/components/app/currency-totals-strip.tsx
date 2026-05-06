import { Coins } from "lucide-react";

export type CurrencyTotal = {
  currency: string;
  total_balance: number | string;
  account_count?: number | string;
};

export function CurrencyTotalsStrip({
  totals,
  label = "Total balances",
  emptyText = "No balances yet.",
  size = "md",
}: {
  totals: CurrencyTotal[] | undefined;
  label?: string;
  emptyText?: string;
  size?: "sm" | "md" | "lg";
}) {
  const list = totals ?? [];
  const amountClass =
    size === "lg" ? "font-serif text-2xl text-gold"
    : size === "sm" ? "font-serif text-base text-gold"
    : "font-serif text-xl text-gold";

  return (
    <div className="rounded-lg border border-[oklch(0.74_0.135_82/0.25)] bg-[linear-gradient(135deg,oklch(0.74_0.135_82/0.08),transparent)] p-3">
      <div className="mb-2 section-title">
        <Coins className="h-3.5 w-3.5" />
        {label}
      </div>
      {list.length === 0 ? (
        <div className="text-xs text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {list.map((t) => (
            <div
              key={t.currency}
              className="flex items-center gap-2 rounded-lg border border-[oklch(0.74_0.135_82/0.22)] bg-card/70 px-3 py-1.5 shadow-sm backdrop-blur-sm"
            >
              <span className="chip chip-gold shrink-0">{t.currency}</span>
              <div className="flex flex-col leading-tight">
                <span className={`${amountClass} num`}>
                  {Number(t.total_balance ?? 0).toLocaleString()}
                </span>
                {t.account_count !== undefined && (
                  <span className="text-[10px] text-muted-foreground">
                    {Number(t.account_count)} acct
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}