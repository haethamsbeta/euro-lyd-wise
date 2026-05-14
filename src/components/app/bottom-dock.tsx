import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ArrowRightLeft,
  Users as UsersIcon,
  Wallet,
  ClipboardCheck,
  ScrollText,
  Plus,
  Activity,
  Layers,
} from "lucide-react";
import { useAuth, type AppRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { DATA_BACKEND, REALTIME_MODE, POLL_INTERVALS } from "@/lib/runtimeConfig";

type DockItemDef = {
  key: string;
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number;
};

type DockKey = "Dashboard" | "Transactions" | "Holders" | "Vaults" | "Approvals" | "Audit" | "MyActivity" | "Groups";

const ITEMS: Record<DockKey, Omit<DockItemDef, "badge">> = {
  Dashboard:    { key: "Dashboard",    to: "/app",              labelKey: "dock.dashboard",    icon: LayoutDashboard },
  Transactions: { key: "Transactions", to: "/app/transactions", labelKey: "dock.transactions", icon: ArrowRightLeft },
  Holders:      { key: "Holders",      to: "/app/holders",      labelKey: "dock.holders",      icon: UsersIcon },
  Vaults:       { key: "Vaults",       to: "/app/vaults",       labelKey: "dock.vaults",       icon: Wallet },
  Approvals:    { key: "Approvals",    to: "/app/approvals",    labelKey: "dock.approvals",    icon: ClipboardCheck },
  Audit:        { key: "Audit",        to: "/app/audit",        labelKey: "dock.audit",        icon: ScrollText },
  MyActivity:   { key: "MyActivity",   to: "/app/me/activity",  labelKey: "dock.myActivity",   icon: Activity },
  Groups:       { key: "Groups",       to: "/app/groups",       labelKey: "dock.groups",       icon: Layers },
};

const DOCK_CONFIG: Record<AppRole, { left: DockKey[]; right: DockKey[]; showFab: boolean }> = {
  admin:    { left: ["Dashboard", "Transactions"], right: ["Holders", "Groups"], showFab: true },
  teller:   { left: ["Dashboard", "Transactions"], right: ["Holders", "MyActivity"], showFab: true },
  auditor:  { left: ["Dashboard", "Transactions"], right: ["Holders", "Audit"],     showFab: false },
  consumer: { left: ["Dashboard"],                  right: [],                       showFab: false },
};

function pickRole(roles: AppRole[]): AppRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("teller")) return "teller";
  if (roles.includes("auditor")) return "auditor";
  return "consumer";
}

function isActive(path: string, to: string) {
  if (to === "/app") return path === "/app";
  return path === to || path.startsWith(to + "/");
}

function DockItem({ item, active, t }: { item: DockItemDef; active: boolean; t: (k: string) => string }) {
  const Icon = item.icon;
  const label = t(item.labelKey);
  return (
    <Link
      to={item.to}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
        "min-w-[48px] min-h-[44px] px-1.5 py-1 sm:min-w-[56px] sm:px-3 sm:py-1.5",
        active
          ? "text-gold"
          : "text-muted-foreground hover:text-foreground hover:bg-gold/10",
      )}
    >
      {active && (
        <motion.div
          layoutId="dock-active-dot"
          className="absolute -top-1.5 sm:-top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold"
          style={{ boxShadow: "0 0 8px oklch(var(--gold) / 0.8)" }}
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      <div className="relative">
        <Icon className="w-[22px] h-[22px] sm:w-5 sm:h-5" strokeWidth={1.75} />
        {item.badge && item.badge > 0 ? (
          <span
            className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground rounded-full text-[9px] font-bold min-w-[14px] h-[14px] px-1 flex items-center justify-center leading-none"
            aria-label={`${item.badge} pending`}
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </div>
      <span className="text-[10px] sm:text-[10px] font-medium tracking-wide leading-tight text-center max-w-[68px] sm:max-w-[80px] truncate">{label}</span>
    </Link>
  );
}

function Fab({ label }: { label: string }) {
  return (
    <Link
      to="/app/transactions/new"
      aria-label={label}
      title={label}
      className="group relative inline-flex items-center justify-center rounded-full border-2 border-background bg-gradient-gold text-primary-foreground transition-all -mt-8 mx-1.5 w-[56px] h-[56px] sm:-mt-7 sm:mx-3 sm:w-[60px] sm:h-[60px] lg:-mt-7 lg:w-14 lg:h-14"
      style={{
        boxShadow:
          "0 8px 24px oklch(var(--gold) / 0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow =
          "0 8px 32px oklch(var(--gold) / 0.7), inset 0 1px 0 rgba(255,255,255,0.4)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow =
          "0 8px 24px oklch(var(--gold) / 0.5), inset 0 1px 0 rgba(255,255,255,0.3)";
      }}
    >
      <span className="pointer-events-none absolute inset-0 rounded-full bg-gold/30 opacity-30 animate-ping" />
      <Plus
        className="relative z-10 w-7 h-7 sm:w-7 sm:h-7 transition-transform duration-300 group-hover:rotate-90"
        strokeWidth={2.5}
      />
    </Link>
  );
}

export function BottomDock() {
  const roles = useEffectiveRoles();
  const location = useLocation();
  const t = useT();
  const role = pickRole(roles as AppRole[]);
  const cfg = DOCK_CONFIG[role];

  // Live pending-approvals count for admin badge. RLS already blocks others.
  // Single source of truth: read pending count from the same /dashboard/staff
  // payload the dashboard already fetches. The adapter dedupes concurrent
  // calls via a 5s in-flight cache, so this does not add a network round-trip
  // when the dashboard is also mounted.
  const { data: pendingCount = 0 } = useQuery({
    enabled: role === "admin",
    queryKey: ["dashboard.pending"],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const r: any = await api.dashboard.admin().catch(() => null);
        return Number(r?.pending_approvals ?? 0);
      }
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval:
      REALTIME_MODE === "polling" ? POLL_INTERVALS.dashboard : false,
  });

  const withBadge = (key: DockKey): DockItemDef => {
    const base = ITEMS[key];
    if (key === "Approvals" && role === "admin") return { ...base, badge: pendingCount };
    return base;
  };

  const left = cfg.left.map(withBadge);
  const right = cfg.right.map(withBadge);

  return (
    <motion.div
      dir="ltr"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", bounce: 0.15, duration: 0.5, delay: 0.1 }}
      className="fixed inset-x-0 bottom-0 z-20 pointer-events-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.25rem)" }}
    >
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-24 bg-gold/10 blur-3xl pointer-events-none" />

      <div
        className="relative pointer-events-auto mx-2 mb-3 max-w-2xl h-[72px] sm:mx-6 sm:mb-4 sm:h-[68px] lg:mx-auto lg:mb-3 lg:h-16 rounded-2xl bg-card/90 backdrop-blur-xl border border-gold/20 flex items-center justify-around px-1 sm:px-2"
        style={{
          boxShadow:
            "0 -8px 32px rgba(0,0,0,0.5), 0 0 0 1px oklch(var(--gold) / 0.08)",
        }}
      >
        <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent pointer-events-none" />

        <div className="flex flex-1 items-center justify-around">
          {left.map((item) => (
            <DockItem key={item.key} item={item} active={isActive(location.pathname, item.to)} t={t} />
          ))}
        </div>

        {cfg.showFab ? <Fab label={t("nav.newTransaction")} /> : <div className="w-2" />}

        <div className="flex flex-1 items-center justify-around">
          {right.map((item) => (
            <DockItem key={item.key} item={item} active={isActive(location.pathname, item.to)} t={t} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
