import { Link, useLocation, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, hasAnyRole, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, PlusCircle, ListOrdered, Wallet,
  ClipboardCheck, ScrollText, UserCog, LogOut, ShieldAlert, Activity, Bell, ChevronDown, Info, Upload, IdCard,
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
  { to: "/app/approvals", labelKey: "nav.approvals", icon: ClipboardCheck, roles: ["admin"] },
  { to: "/app/import", labelKey: "nav.import", icon: Upload, roles: ["admin"] },
  { to: "/app/import/review", labelKey: "nav.importReview", icon: ClipboardCheck, roles: ["admin"] },
  { to: "/app/me/activity", labelKey: "nav.myActivity", icon: Activity, roles: ["admin", "teller"] },
  { to: "/app/audit", labelKey: "nav.audit", icon: ScrollText, roles: ["admin", "auditor"] },
  { to: "/app/users", labelKey: "nav.users", icon: UserCog, roles: ["admin"] },
  { to: "/app/settings/notifications", labelKey: "nav.notifications", icon: Bell, roles: ["admin", "teller", "auditor"] },
  { to: "/app/about", labelKey: "nav.about", icon: Info, roles: ["admin", "teller", "auditor"] },
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
  // Prevents `/app/transactions` from looking active when on `/app/transactions/new`.
  const activeTo = (() => {
    const matches = visibleNav.filter((i) =>
      location.pathname === i.to || (i.to !== "/app" && location.pathname.startsWith(i.to + "/")) || (i.to === "/app" && location.pathname === "/app")
    );
    if (matches.length === 0) return null;
    return matches.reduce((a, b) => (b.to.length > a.to.length ? b : a)).to;
  })();

  return (
    <NotificationsProvider>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar */}
        <aside className="hidden w-64 flex-col border-r border-[oklch(0.82_0.14_85/0.12)] bg-sidebar text-sidebar-foreground md:flex">
          <Link to="/app" className="flex h-20 items-center gap-3 border-b border-[oklch(0.82_0.14_85/0.12)] px-5">
            <DahabCoin />
            <DahabMark size="sm" showArabic={false} />
          </Link>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {visibleNav.map((item) => {
              const active = item.to === activeTo;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-[oklch(0.82_0.14_85/0.10)] text-foreground font-medium"
                      : "text-muted-foreground hover:bg-[oklch(0.82_0.14_85/0.06)] hover:text-foreground",
                  )}
                >
                  {active && (
                    <span className="absolute start-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-e bg-gradient-gold shadow-gold" aria-hidden />
                  )}
                  <Icon className={cn("h-4 w-4", active ? "text-gold" : "")} />
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-[oklch(0.82_0.14_85/0.12)] p-4">
            <AccountMenu variant="full" />
            <div className="mt-3 flex items-center justify-center gap-2">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-x-hidden">
          {/* Desktop top bar */}
          <div className="hidden items-center justify-end gap-2 border-b border-[oklch(0.82_0.14_85/0.12)] bg-background/60 px-6 py-2.5 backdrop-blur md:flex">
            <LanguageToggle />
            <ThemeToggle />
            <NotificationBell />
            <AccountMenu />
          </div>
          {/* Mobile top bar */}
          <div className="border-b border-[oklch(0.82_0.14_85/0.12)] bg-background px-4 py-3 md:hidden">
            <div className="flex items-center justify-between">
              <Link to="/app" className="flex items-center gap-2">
                <DahabCoin />
                <DahabMark size="sm" showArabic={false} />
              </Link>
              <div className="flex items-center gap-1">
                <LanguageToggle />
                <ThemeToggle />
                <NotificationBell />
                <AccountMenu />
              </div>
            </div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
              {(() => {
                const primaryNav = visibleNav.slice(0, 3);
                const moreNav = visibleNav.slice(3);
                const isActive = (to: string) => to === activeTo;
                const moreActive = moreNav.some((i) => isActive(i.to));
                return (
                  <>
                    {primaryNav.map((i) => {
                      const active = isActive(i.to);
                      return (
                        <Link
                          key={i.to}
                          to={i.to}
                          className={cn(
                            "whitespace-nowrap rounded-md border px-2.5 py-1 text-xs transition-colors",
                            active
                              ? "border-[oklch(0.82_0.14_85/0.4)] bg-[oklch(0.82_0.14_85/0.1)] text-gold"
                              : "border-[oklch(0.82_0.14_85/0.12)] text-muted-foreground hover:border-[oklch(0.82_0.14_85/0.3)] hover:text-foreground",
                          )}
                        >
                          {t(i.labelKey)}
                        </Link>
                      );
                    })}
                    {moreNav.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={cn(
                            "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs transition-colors",
                            moreActive
                              ? "border-[oklch(0.82_0.14_85/0.4)] bg-[oklch(0.82_0.14_85/0.1)] text-gold"
                              : "border-[oklch(0.82_0.14_85/0.12)] text-muted-foreground hover:border-[oklch(0.82_0.14_85/0.3)] hover:text-foreground",
                          )}
                        >
                          {t("nav.more")} <ChevronDown className="h-3 w-3" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                          {moreNav.map((i) => {
                            const active = isActive(i.to);
                            const Icon = i.icon;
                            return (
                              <DropdownMenuItem key={i.to} asChild>
                                <Link
                                  to={i.to}
                                  className={cn(
                                    "flex w-full items-center gap-2 text-sm",
                                    active && "text-gold",
                                  )}
                                >
                                  <Icon className="h-4 w-4" />
                                  {t(i.labelKey)}
                                </Link>
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
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
