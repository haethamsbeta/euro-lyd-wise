import * as React from "react";
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import { PremiumCard } from "@/components/ui/premium-card";
import { cn } from "@/lib/utils";

/**
 * Reports / dashboard KPI card. Gold icon chip top-left, optional trend
 * pill top-right, uppercase eyebrow label, large tabular-nums value.
 * Trend is omitted entirely when no comparison data is provided.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  trend?: { value: string; up: boolean };
  className?: string;
}) {
  return (
    <PremiumCard className={cn("p-5", className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-[oklch(from_var(--gold)_l_c_h/0.10)] text-gold border border-[oklch(from_var(--gold)_l_c_h/0.20)]">
          <Icon className="w-4 h-4" />
        </div>
        {trend ? (
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              trend.up ? "text-[var(--success)]" : "text-[var(--destructive)]",
            )}
          >
            {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.value}
          </span>
        ) : null}
      </div>
      <p className="text-[10px] tracking-[0.15em] uppercase text-text-secondary font-medium mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </PremiumCard>
  );
}