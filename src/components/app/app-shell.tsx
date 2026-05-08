import { Link, useLocation, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [sheetOpen, setSheetOpen] = useState(false);

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
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={item.to}
            aria-label={t(item.labelKey)}
            className={cn(
              "group relative inline-flex h-12 w-12 items-center justify-center rounded-2xl transition-all",
              active
                ? "bg-gradient-gold text-primary-foreground shadow-gold ring-1 ring-gold/40"
                : "text-muted-foreground hover:bg-gold/10 hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                active
                  ? "bg-primary-foreground/15 text-primary-foreground"
                  : "bg-gold/5 ring-1 ring-inset ring-gold/15 group-hover:ring-gold/35 group-hover:[filter:drop-shadow(0_0_6px_var(--gold))]",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.5} />
            </span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t(item.labelKey)}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <NotificationsProvider>
      <TooltipProvider delayDuration={150}>
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
              "relative mx-auto grid max-w-5xl grid-cols-[auto_1fr_auto] items-center gap-3 rounded-3xl border border-gold/25",
              "bg-card/85 px-4 py-2.5 backdrop-blur-xl shadow-[var(--shadow-gold)] sm:px-6",
            )}
          >
            {/* More tile → side Sheet */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SheetTrigger
                    aria-label={t("nav.more")}
                    className={cn(
                      "group relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all",
                      "bg-gold/10 ring-1 ring-gold/30 hover:bg-gold/20",
                    )}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-inset ring-gold/35 text-foreground">
                      <Menu className="h-5 w-5" strokeWidth={1.5} />
                    </span>
                  </SheetTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("nav.more")}</TooltipContent>
              </Tooltip>

              <SheetContent side="left" className="w-80 sm:w-96 overflow-y-auto bg-card border-r-gold/25">
                <SheetHeader>
                  <SheetTitle className="font-serif text-xl">{t("nav.more")}</SheetTitle>
                </SheetHeader>

                {/* Navigation */}
                <div className="mt-4 flex flex-col gap-1">
                  <div className="px-1 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {t("nav.dashboard").length ? "Navigation" : "Navigation"}
                  </div>
                  {overflowNav.map((i) => {
                    const active = isActive(i.to);
                    const Icon = i.icon;
                    return (
                      <Link
                        key={i.to}
                        to={i.to}
                        onClick={() => setSheetOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                          active
                            ? "bg-gold/15 text-gold ring-1 ring-gold/35"
                            : "text-foreground hover:bg-gold/10",
                        )}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10 ring-1 ring-inset ring-gold/20">
                          <Icon className="h-4 w-4" strokeWidth={1.5} />
                        </span>
                        {t(i.labelKey)}
                      </Link>
                    );
                  })}
                </div>

                {/* Preferences */}
                <div className="mt-6 border-t border-gold/20 pt-4">
                  <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Preferences
                  </div>
                  <div className="flex items-center gap-2">
                    <LanguageToggle />
                    <ThemeToggle />
                  </div>
                </div>

                {/* Account */}
                <div className="mt-6 border-t border-gold/20 pt-4">
                  <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {t("account.signedInAs")}
                  </div>
                  <AccountMenu variant="full" />
                </div>
              </SheetContent>
            </Sheet>

            {/* Primary tiles + raised center */}
            <nav className="flex items-center justify-center gap-3 sm:gap-5">
              {leftNav.map((item) => (
                <Tile key={item.to} item={item} />
              ))}

              {raisedNav ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={raisedNav.to}
                      aria-label={t(raisedNav.labelKey)}
                      className={cn(
                        "relative -mt-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-gold text-primary-foreground",
                        "ring-4 ring-card shadow-gold transition-transform hover:scale-105",
                        "before:absolute before:-inset-1 before:rounded-full before:bg-gold/20 before:blur-md before:-z-10",
                        isActive(raisedNav.to) && "scale-105",
                      )}
                    >
                      <PlusCircle className="h-7 w-7" strokeWidth={1.75} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t(raisedNav.labelKey)}</TooltipContent>
                </Tooltip>
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
            <div className="flex shrink-0 items-center gap-1 justify-self-end">
              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="overflow-x-hidden pt-6 sm:pt-8 lg:pl-24">
          <Outlet />
        </main>
      </div>
      </TooltipProvider>
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
