import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Languages } from "lucide-react";

/**
 * EN | عربي pill. Two visual variants:
 *   - "default": bordered, suitable for headers
 *   - "subtle":  borderless, for footers / under-card placements
 */
export function LanguageToggle({
  className,
  variant = "default",
  showIcon = false,
}: {
  className?: string;
  variant?: "default" | "subtle";
  showIcon?: boolean;
}) {
  const { lang, setLang } = useLang();

  const wrap =
    variant === "default"
      ? "inline-flex items-center gap-1 rounded-full border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.05)] p-0.5"
      : "inline-flex items-center gap-3 text-sm";

  if (variant === "subtle") {
    return (
      <div
        className={cn(wrap, className)}
        role="group"
        aria-label="Language"
        dir="ltr"
      >
        <button
          type="button"
          onClick={() => setLang("ar")}
          className={cn(
            "transition-colors hover:text-foreground",
            lang === "ar"
              ? "font-semibold text-gold"
              : "text-muted-foreground",
          )}
          style={{ fontFamily: "'Amiri', serif" }}
          lang="ar"
        >
          عربي
        </button>
        <span aria-hidden className="h-3 w-px bg-[oklch(0.82_0.14_85/0.4)]" />
        <button
          type="button"
          onClick={() => setLang("en")}
          className={cn(
            "transition-colors hover:text-foreground",
            lang === "en"
              ? "font-semibold text-gold"
              : "text-muted-foreground",
          )}
        >
          English
        </button>
      </div>
    );
  }

  const pill = (active: boolean) =>
    cn(
      "rounded-full px-2.5 py-1 text-xs font-semibold transition-all",
      active
        ? "bg-gradient-gold text-[oklch(0.18_0.03_60)] shadow-[inset_0_0_0_1px_oklch(0.55_0.12_72/0.5)]"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div
      className={cn(wrap, className)}
      role="group"
      aria-label="Language"
      dir="ltr"
    >
      {showIcon ? (
        <Languages className="ms-1.5 h-3.5 w-3.5 text-muted-foreground" />
      ) : null}
      <button
        type="button"
        onClick={() => setLang("en")}
        className={pill(lang === "en")}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("ar")}
        className={pill(lang === "ar")}
        aria-pressed={lang === "ar"}
        style={{ fontFamily: "'Amiri', serif" }}
        lang="ar"
      >
        عربي
      </button>
    </div>
  );
}