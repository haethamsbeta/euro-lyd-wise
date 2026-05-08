import { Link, useLocation, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, hasAnyRole, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, PlusCircle, ListOrdered, Wallet,
  ClipboardCheck, ScrollText, UserCog, ShieldAlert, Activity, Bell, Info, IdCard, Fingerprint, Layers, BarChart3, MoreHorizontal, Users as UsersIcon,
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
  icon: React.ComponentType<{ className?: string }>;
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

// Pages pinned to the floating toolbar (the rest go under the 3-dots menu).
const PRIMARY_TOOLBAR_PATHS = [
  "/app",
  "/app/transactions/new",
  "/app/transactions",
  "/app/holders",
  "/app/approvals",
  "/app/vaults",
];

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

  // Build primary chips (max 5 visible to user) and overflow set for the 3-dots menu.
  const primaryNav = PRIMARY_TOOLBAR_PATHS
    .map((p) => visibleNav.find((i) => i.to === p))
    .filter(Boolean)
    .slice(0, 5) as NavItem[];
  const primarySet = new Set(primaryNav.map((i) => i.to));
  const overflowNav = visibleNav.filter((i) => !primarySet.has(i.to));
  const isActive = (to: string) => to === activeTo;

  return (
    <NotificationsProvider>
      <div className="min-h-screen bg-background">
        {/* Floating top toolbar */}
        <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
          <div
            className={cn(
              "mx-auto flex max-w-6xl items-center gap-2 rounded-full border border-[oklch(0.82_0.14_85/0.25)]",
              "bg-background/70 px-2 py-1.5 shadow-[0_10px_30px_-12px_oklch(0.82_0.14_85/0.35)] backdrop-blur-xl sm:gap-3 sm:px-3 sm:py-2",
            )}
          >
            {/* Brand */}
            <Link to="/app" className="flex shrink-0 items-center gap-2 ps-1.5 pe-2">
              <DahabCoin />
              <span className="hidden sm:inline">
                <DahabMark size="sm" showArabic={false} />
              </span>
            </Link>

            <span className="hidden h-6 w-px shrink-0 bg-[oklch(0.82_0.14_85/0.2)] sm:block" />

            {/* Primary chips (desktop) */}
            <nav className="hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
              {primaryNav.map((i) => {
                const active = isActive(i.to);
                const Icon = i.icon;
                return (
                  <Link
                    key={i.to}
                    to={i.to}
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-[oklch(0.82_0.14_85/0.45)] bg-gradient-gold text-[oklch(0.18_0.03_60)] shadow-gold"
                        : "border-transparent text-muted-foreground hover:border-[oklch(0.82_0.14_85/0.25)] hover:bg-[oklch(0.82_0.14_85/0.06)] hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(i.labelKey)}
                  </Link>
                );
              })}
            </nav>

            <div className="flex flex-1 md:flex-initial" />

            {/* Right cluster */}
            <div className="flex shrink-0 items-center gap-1">
              <NotificationBell />
              <span className="hidden sm:flex items-center gap-1">
                <LanguageToggle />
                <ThemeToggle />
              </span>
              <AccountMenu />
              {/* 3-dots menu — full nav lives here */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t("nav.more")}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.05)] text-foreground transition-colors hover:bg-[oklch(0.82_0.14_85/0.1)]"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-64">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("nav.more")}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/* Mobile: show primary entries too */}
                  <div className="md:hidden">
                    {primaryNav.map((i) => {
                      const active = isActive(i.to);
                      const Icon = i.icon;
                      return (
                        <DropdownMenuItem key={i.to} asChild>
                          <Link to={i.to} className={cn("flex w-full items-center gap-2 text-sm", active && "text-gold")}>
                            <Icon className="h-4 w-4" />
                            {t(i.labelKey)}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                    {primaryNav.length > 0 && overflowNav.length > 0 && <DropdownMenuSeparator />}
                  </div>
                  {overflowNav.map((i) => {
                    const active = isActive(i.to);
                    const Icon = i.icon;
                    return (
                      <DropdownMenuItem key={i.to} asChild>
                        <Link to={i.to} className={cn("flex w-full items-center gap-2 text-sm", active && "text-gold")}>
                          <Icon className="h-4 w-4" />
                          {t(i.labelKey)}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator className="sm:hidden" />
                  <div className="flex items-center justify-center gap-2 px-2 py-1.5 sm:hidden">
                    <LanguageToggle />
                    <ThemeToggle />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="overflow-x-hidden pt-3 sm:pt-4">
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
