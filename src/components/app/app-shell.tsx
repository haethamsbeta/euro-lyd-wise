import { Link, useLocation, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, hasAnyRole, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, PlusCircle, ListOrdered, Wallet,
  ClipboardCheck, ScrollText, UserCog, ShieldAlert, Activity, Bell, Info, IdCard, Fingerprint, Layers, BarChart3, Menu, Users as UsersIcon,
} from "lucide-react";
import { NotificationsProvider } from "@/lib/notifications";
import { NotificationBell } from "@/components/app/notification-bell";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AccountMenu } from "@/components/app/account-menu";
import { useT } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  roles: AppRole[];
};

const NAV: NavItem[] = [
  { to: "/app", labelKey: "nav.dashboard", icon: LayoutDashboard, roles: ["admin", "teller", "auditor"] },
  { to: "/app/transactions/new", labelKey: "nav.newTransaction", icon: PlusCircle, roles: ["admin", "teller"] },
  { to: "/app/transactions", labelKey: "nav.transactions", icon: ListOrdered, roles: ["admin", "teller", "auditor"] },
  { to: "/app/holders", labelKey: "nav.holders", icon: IdCard, roles: ["admin", "teller", "auditor"] },
  { to: "/app/vaults", labelKey: "nav.vaults", icon: Wallet, roles: ["admin", "teller", "auditor"] },
  { to: "/app/groups", labelKey: "nav.groups", icon: Layers, roles: ["admin", "auditor"] },
  { to: "/app/approvals", labelKey: "nav.approvals", icon: ClipboardCheck, roles: ["admin"] },
  { to: "/app/me/activity", labelKey: "nav.myActivity", icon: Activity, roles: ["admin", "teller"] },
  { to: "/app/audit", labelKey: "nav.audit", icon: ScrollText, roles: ["admin", "auditor"] },
  { to: "/app/reports", labelKey: "nav.reports", icon: BarChart3, roles: ["admin", "auditor"] },
  { to: "/app/users", labelKey: "nav.users", icon: UserCog, roles: ["admin"] },
  { to: "/app/portal-accounts", labelKey: "nav.portalAccounts", icon: UsersIcon, roles: ["admin"] },
  { to: "/app/settings/notifications", labelKey: "nav.notifications", icon: Bell, roles: ["admin", "teller", "auditor"] },
  { to: "/app/settings/security", labelKey: "nav.security", icon: Fingerprint, roles: ["admin", "teller", "auditor"] },
  { to: "/app/about", labelKey: "nav.about", icon: Info, roles: ["admin", "teller", "auditor"] },
];

// Pages pinned to the floating toolbar (raised center action is /app/transactions/new).
// Order: Dashboard, Transactions, [raised center], Holders, Approvals (or Vaults fallback).
const PRIMARY_LEFT_PATHS = ["/app", "/app/transactions"];
const PRIMARY_RIGHT_PATHS = ["/app/holders", "/app/approvals", "/app/vaults"];
const RAISED_PATH = "/app/transactions/new";

export function AppShell() {
  const { session, roles, loading, rolesLoading, signOut, user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const t = useT();

  useEffect(() => {
    if (loading) return;
    if (!session) nav({ to: "/login", search: {} as any });
  }, [session, loading, nav]);

  if (loading || !session || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <DahabMark size="lg" showIcon priority />
          <span className="mt-2 text-xs uppercase tracking-[0.32em] text-muted-foreground">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  const isStaff = hasAnyRole(roles, ["admin", "teller", "auditor"]);
  if (!isStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="card-luxe max-w-md rounded-xl p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-warning" />
          <h1 className="mt-3 font-serif text-xl font-semibold">{t("shell.noStaffTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("shell.noStaffBody")}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="outline" className="border-[oklch(0.82_0.14_85/0.3)]">
              <Link to="/portal">{t("landing.customerPortal")}</Link>
            </Button>
            <Button onClick={() => signOut()} className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
              {t("common.signOut")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const visibleNav = NAV.filter((i) => hasAnyRole(roles, i.roles));

  // Active match: pick the longest nav prefix that matches the current path.
  const activeTo = (() => {
    const matches = visibleNav.filter((i) =>
      location.pathname === i.to || (i.to !== "/app" && location.pathname.startsWith(i.to + "/")) || (i.to === "/app" && location.pathname === "/app")
    );
    if (matches.length === 0) return null;
    return matches.reduce((a, b) => (b.to.length > a.to.length ? b : a)).to;
  })();

  const isActive = (to: string) => to === activeTo;
  const findNav = (p: string) => visibleNav.find((i) => i.to === p);
  const leftNav = PRIMARY_LEFT_PATHS.map(findNav).filter(Boolean) as NavItem[];
  const rightNav = PRIMARY_RIGHT_PATHS.map(findNav).filter(Boolean).slice(0, 2) as NavItem[];
  const raisedNav = findNav(RAISED_PATH);
  const primarySet = new Set<string>([
    ...leftNav.map((i) => i.to),
    ...rightNav.map((i) => i.to),
    ...(raisedNav ? [raisedNav.to] : []),
  ]);
  const overflowNav = visibleNav.filter((i) => !primarySet.has(i.to));

  // Renders one icon-over-label tile (mockup bottom-nav rhythm)
  const Tile = ({ item }: { item: NavItem }) => {
    const active = isActive(item.to);
    const Icon = item.icon;
    return (
      <Link
        to={item.to}
        className={cn(
          "group relative flex h-13 w-14 flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-medium uppercase leading-none tracking-[0.08em] transition-all sm:w-16",
          active
            ? "bg-gradient-gold text-[oklch(0.18_0.03_60)] shadow-[0_8px_20px_-8px_oklch(0.82_0.14_85/0.6)] ring-1 ring-[oklch(0.82_0.14_85/0.45)]"
            : "text-muted-foreground hover:bg-[oklch(0.82_0.14_85/0.08)] hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
            active
              ? "bg-[oklch(0.18_0.03_60/0.18)] text-[oklch(0.18_0.03_60)]"
              : "bg-[oklch(0.82_0.14_85/0.06)] ring-1 ring-inset ring-[oklch(0.82_0.14_85/0.18)] group-hover:ring-[oklch(0.82_0.14_85/0.4)] group-hover:[filter:drop-shadow(0_0_6px_oklch(0.82_0.14_85/0.45))]",
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </span>
        <span className="truncate px-1">{t(item.labelKey)}</span>
      </Link>
    );
  };

  return (
    <NotificationsProvider>
      <div className="min-h-screen bg-background">
        {/* Stationary brand mark — does not move with the toolbar */}
        <Link
          to="/app"
          className="fixed top-3 left-3 z-50 flex items-center gap-2 sm:top-4 sm:left-6"
          aria-label="Dahab"
        >
          <DahabCoin />
          <span className="hidden lg:inline">
            <DahabMark size="sm" showArabic={false} />
          </span>
        </Link>

        {/* Floating mockup-style top toolbar */}
        <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
          <div
            className={cn(
              "relative mx-auto flex max-w-3xl items-center gap-2 rounded-3xl border border-[oklch(0.82_0.14_85/0.4)]",
              "bg-gradient-to-b from-[oklch(0.22_0.04_60/0.9)] to-[oklch(0.16_0.03_60/0.85)] px-3 py-2 backdrop-blur-xl",
              "shadow-[0_18px_40px_-18px_oklch(0.82_0.14_85/0.45)] sm:px-4",
            )}
          >
            {/* More tile (opposite side, larger) */}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("nav.more")}
                className={cn(
                  "group relative flex h-14 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-foreground transition-all sm:w-24",
                  "bg-[oklch(0.82_0.14_85/0.12)] ring-1 ring-[oklch(0.82_0.14_85/0.35)]",
                  "shadow-[0_8px_20px_-10px_oklch(0.82_0.14_85/0.5)] hover:bg-[oklch(0.82_0.14_85/0.2)]",
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(0.82_0.14_85/0.18)] ring-1 ring-inset ring-[oklch(0.82_0.14_85/0.4)]">
                  <Menu className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <span>{t("nav.more")}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-64">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("nav.more")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {overflowNav.map((i) => {
                  const active = isActive(i.to);
                  const Icon = i.icon;
                  return (
                    <DropdownMenuItem key={i.to} asChild>
                      <Link to={i.to} className={cn("flex w-full items-center gap-2 text-sm", active && "text-gold")}>
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                        {t(i.labelKey)}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <div className="flex items-center justify-center gap-2 px-2 py-1.5">
                  <LanguageToggle />
                  <ThemeToggle />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Primary tiles + raised center */}
            <nav className="flex flex-1 items-end justify-center gap-1 sm:gap-2">
              {leftNav.map((item) => (
                <Tile key={item.to} item={item} />
              ))}

              {raisedNav ? (
                <div className="flex w-16 flex-col items-center sm:w-20">
                  <Link
                    to={raisedNav.to}
                    aria-label={t(raisedNav.labelKey)}
                    className={cn(
                      "relative -mt-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-gold text-[oklch(0.18_0.03_60)]",
                      "ring-4 ring-[oklch(0.18_0.03_60/0.85)] shadow-[0_10px_24px_-6px_oklch(0.82_0.14_85/0.7)] transition-transform hover:scale-105",
                      "before:absolute before:-inset-1 before:rounded-full before:bg-[oklch(0.82_0.14_85/0.18)] before:blur-md before:-z-10",
                      isActive(raisedNav.to) && "scale-105",
                    )}
                  >
                    <PlusCircle className="h-6 w-6" strokeWidth={1.75} />
                  </Link>
                  <span
                    className={cn(
                      "mt-1 text-[10px] font-medium leading-none",
                      isActive(raisedNav.to) ? "text-gold" : "text-muted-foreground",
                    )}
                  >
                    {t("newtx.deposit").length > 0 ? "New" : "New"}
                  </span>
                </div>
              ) : null}

              {rightNav.slice(0, 1).map((item) => (
                <Tile key={item.to} item={item} />
              ))}
              <span className="hidden sm:inline">
                {rightNav.slice(1, 2).map((item) => (
                  <Tile key={item.to} item={item} />
                ))}
              </span>
            </nav>

            {/* Right cluster */}
            <div className="flex shrink-0 items-center gap-1 ps-1">
              <NotificationBell />
              <AccountMenu />
            </div>
          </div>
        </header>

        <main className="overflow-x-hidden pt-6 sm:pt-8 lg:pl-24">
          <Outlet />
        </main>
      </div>
    </NotificationsProvider>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="border-b border-[oklch(0.82_0.14_85/0.12)] bg-background">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-6 sm:py-6">
        <div className="min-w-0">
          <h1 className="font-serif text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 [&>*]:w-full sm:[&>*]:w-auto">{actions}</div> : null}
      </div>
    </div>
  );
}

export function RoleGate({ allow, children }: { allow: AppRole[]; children: React.ReactNode }) {
  const { roles } = useAuth();
  if (!hasAnyRole(roles, allow)) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        You don't have permission to view this page.
      </div>
    );
  }
  return <>{children}</>;
}
