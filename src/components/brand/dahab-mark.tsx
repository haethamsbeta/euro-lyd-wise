import { cn } from "@/lib/utils";

/**
 * The Dahab wordmark. A serif "DAHAB" with a thin gold rule and the Arabic
 * "ذهب" (gold) set beneath. Use across navigation, headers, and email.
 */
export function DahabMark({
  className,
  size = "md",
  showArabic = true,
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showArabic?: boolean;
}) {
  const sizes = {
    sm: { wordmark: "text-base", arabic: "text-[10px]", rule: "w-6" },
    md: { wordmark: "text-xl", arabic: "text-[11px]", rule: "w-8" },
    lg: { wordmark: "text-3xl", arabic: "text-sm", rule: "w-12" },
    xl: { wordmark: "text-5xl", arabic: "text-base", rule: "w-16" },
  } as const;
  const s = sizes[size];
  return (
    <div className={cn("inline-flex flex-col items-center leading-none", className)}>
      <span
        className={cn(
          "font-serif font-semibold tracking-[0.32em] gold-text",
          s.wordmark,
        )}
      >
        DAHAB
      </span>
      {showArabic ? (
        <>
          <span className={cn("mt-1.5 h-px bg-gradient-to-r from-transparent via-[oklch(0.82_0.14_85/0.7)] to-transparent", s.rule)} />
          <span
            className={cn(
              "mt-1.5 font-medium tracking-wide text-gold/70",
              s.arabic,
            )}
            style={{ fontFamily: "'Amiri', serif" }}
            lang="ar"
            dir="rtl"
          >
            ذهب
          </span>
        </>
      ) : null}
    </div>
  );
}

/** Small icon-style coin mark for use in navigation rows. */
export function DahabCoin({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full font-serif text-[12px] font-bold text-primary-foreground shadow-gold",
        "bg-gradient-gold",
        className,
      )}
      aria-hidden
    >
      D
    </span>
  );
}
