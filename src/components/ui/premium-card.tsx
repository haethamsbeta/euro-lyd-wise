import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "premium" | "glass" | "dark-hero";

/**
 * Mockup-parity card. `default` is the standard dark surface with a subtle
 * border and soft shadow; `premium` adds a gold hairline at the top and a
 * gentle gold halo; `glass` is a translucent backdrop-blurred surface;
 * `dark-hero` is the deep onyx + gold gradient used for hero/login surfaces.
 */
export const PremiumCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: Variant }
>(({ className, variant = "default", ...props }, ref) => {
  const v: Record<Variant, string> = {
    default:
      "rounded-2xl bg-card border border-border shadow-[0_4px_16px_rgba(0,0,0,0.25)]",
    premium: "premium-card",
    glass: "rounded-2xl glass-card",
    "dark-hero": "dark-hero-card",
  };
  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden text-card-foreground", v[variant], className)}
      {...props}
    />
  );
});
PremiumCard.displayName = "PremiumCard";