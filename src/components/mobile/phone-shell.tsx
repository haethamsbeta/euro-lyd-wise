import { ReactNode } from "react";
import { Signal, Wifi, BatteryFull } from "lucide-react";

export function PhoneShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-screen w-full surface-cream flex items-center justify-center px-4 py-6">
      <div
        className="relative w-full max-w-[430px] min-h-[844px] bg-card rounded-[2.25rem] overflow-hidden flex flex-col"
        style={{ boxShadow: "var(--shadow-elegant)" }}
      >
        {/* status bar */}
        <div className="flex items-center justify-between px-7 pt-4 pb-1 text-[13px] font-semibold text-foreground">
          <span>9:41</span>
          <div className="flex items-center gap-1.5 text-foreground/80">
            <Signal className="h-3.5 w-3.5" />
            <Wifi className="h-3.5 w-3.5" />
            <BatteryFull className="h-4 w-4" />
          </div>
        </div>

        <div className="flex-1 flex flex-col">{children}</div>

        {footer ? <div className="border-t border-border/70 bg-card">{footer}</div> : null}

        {/* gold wave decoration */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 -z-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 60% at 0% 100%, oklch(0.84 0.10 86 / 0.55) 0%, transparent 65%), radial-gradient(ellipse 80% 60% at 100% 100%, oklch(0.74 0.135 82 / 0.35) 0%, transparent 65%)",
          }}
        />
      </div>
    </div>
  );
}

export function DahamLogo({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="Daham logo">
      <defs>
        <linearGradient id="daham-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.86 0.10 86)" />
          <stop offset="55%" stopColor="oklch(0.74 0.135 82)" />
          <stop offset="100%" stopColor="oklch(0.55 0.115 72)" />
        </linearGradient>
      </defs>
      <rect x="14" y="6" width="72" height="88" rx="14" fill="url(#daham-g)" />
      {/* diagonal ivory stripes evoking the mockup */}
      <g fill="oklch(1 0 0 / 0.85)">
        <polygon points="22,30 46,18 54,18 30,30" />
        <polygon points="22,52 70,28 78,28 30,52" />
        <polygon points="38,72 78,52 78,60 46,72" />
      </g>
    </svg>
  );
}