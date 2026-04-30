import { cn } from "@/lib/utils";
import dahabIcon from "@/assets/dahab-icon.png";
import dahabLogoFull from "@/assets/dahab-logo-full.png";

/**
 * The Dahab wordmark. A serif "DAHAB" with a thin gold rule and the Arabic
 * "ذهب" (gold) set beneath. Use across navigation, headers, and email.
 */
export function DahabMark({
  className,
  size = "md",
  showArabic = true,
  showIcon = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showArabic?: boolean;
  showIcon?: boolean;
}) {
  const sizes = {
    sm: { wordmark: "text-base", arabic: "text-[10px]", rule: "w-6", icon: "h-8 w-8" },
    md: { wordmark: "text-xl", arabic: "text-[11px]", rule: "w-8", icon: "h-11 w-11" },
    lg: { wordmark: "text-3xl", arabic: "text-sm", rule: "w-12", icon: "h-20 w-20" },
    xl: { wordmark: "text-5xl", arabic: "text-base", rule: "w-16", icon: "h-28 w-28" },
  } as const;
  const s = sizes[size];
  return (
    <div className={cn("inline-flex flex-col items-center leading-none", className)}>
      {showIcon ? (
        <img
          src={dahabIcon}
          alt="Dahab"
          className={cn(
            "mb-3 object-contain",
            "drop-shadow-[0_8px_24px_oklch(0.58_0.135_72/0.45)]",
            s.icon,
          )}
          width={256}
          height={256}
        />
      ) : null}
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
