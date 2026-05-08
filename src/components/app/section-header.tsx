import * as React from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  icon: Icon = Sparkles,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="flex items-center gap-2 mb-2">
            <Icon className="w-4 h-4 text-gold" />
            <span className="eyebrow">{eyebrow}</span>
          </div>
        ) : null}
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-text-secondary text-sm mt-1.5">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}