import { Moon, Sun, Monitor, Check } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * Sun · Moon · Monitor theme picker. The icon reflects the *resolved* theme
 * (sand → sun, night → moon) so it's always honest about what the user sees.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolved, setTheme } = useTheme();
  const t = useT();

  const Icon = resolved === "night" ? Moon : Sun;

  const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: "sand", label: t("theme.sand"), icon: Sun },
    { value: "night", label: t("theme.night"), icon: Moon },
    { value: "system", label: t("theme.system"), icon: Monitor },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("theme.toggleLabel")}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.05)] text-muted-foreground transition-colors hover:text-foreground",
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("theme.label")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => {
          const I = o.icon;
          const active = theme === o.value;
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={(e) => {
                e.preventDefault();
                setTheme(o.value);
              }}
              className={cn(
                "flex items-center gap-2 text-sm",
                active && "text-gold",
              )}
            >
              <I className="h-4 w-4" />
              <span className="flex-1">{o.label}</span>
              {active ? <Check className="h-3.5 w-3.5" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
