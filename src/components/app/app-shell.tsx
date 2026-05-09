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
import { BottomDock } from "@/components/app/bottom-dock";
import { GlobalSearch } from "@/components/app/global-search";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
  { to: "/app/admin/fx-rates", labelKey: "nav.fxRates", icon: BarChart3, roles: ["admin"] },
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

  // Full nav list lives in the More drawer. Bottom dock owns primary navigation.
  const overflowNav = visibleNav;
  const hideDock = location.pathname.startsWith("/app/transactions/new");
  const isActive = (to: string) =>
    to === "/app"
      ? location.pathname === "/app"
      : location.pathname === to || location.pathname.startsWith(to + "/");

  const MoreButton = () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={t("nav.more")}
          className={cn(
            "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all",
            "bg-gold/10 ring-1 ring-inset ring-gold/25 text-foreground hover:bg-gold/20 hover:ring-gold/45",
          )}
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t("nav.more")}</TooltipContent>
    </Tooltip>
  );

  const moreSheet = (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent side="left" className="w-80 sm:w-96 overflow-y-auto bg-card border-r-gold/25">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">{t("nav.more")}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-1">
          <div className="px-1 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Navigation
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

        <div className="mt-6 border-t border-gold/20 pt-4">
          <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Preferences
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-6 border-t border-gold/20 pt-4">
          <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("account.signedInAs")}
          </div>
          <AccountMenu variant="full" />
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <NotificationsProvider>
      <TooltipProvider delayDuration={150}>
        <div className="min-h-screen bg-background">
          {/* Full-width sticky toolbar — fixed-width brand on the left, nav after, actions on the right */}
          <header className="sticky top-0 z-40 w-full border-b border-gold/20 bg-card/90 shadow-[0_4px_24px_-12px_oklch(0.18_0.02_70/0.6)] backdrop-blur-xl relative">
            <div className="flex h-16 w-full items-center gap-2 px-3 sm:h-[68px] sm:gap-3 sm:px-5 lg:h-[72px] lg:px-8">
              {/* Left cluster: hamburger (More) → logo. Stationary on every breakpoint. */}
              <div className="flex h-full shrink-0 items-center gap-2 sm:gap-3">
                <MoreButton />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/app"
                      aria-label="Dahab — Home"
                      className="inline-flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-gold/5"
                    >
                      <DahabCoin className="h-9 w-9" />
                      <span className="hidden md:inline">
                        <DahabMark size="sm" showArabic={false} />
                      </span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Dahab — Home</TooltipContent>
                </Tooltip>
              </div>

              {/* Center: global search */}
              <div className="flex flex-1 items-center justify-center px-2">
                <GlobalSearch />
              </div>

              {/* Right action cluster */}
              <div className="flex h-full shrink-0 items-center gap-1.5 sm:gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <NotificationBell />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("nav.notifications")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <AccountMenu variant="compact" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("account.menuLabel")}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            {/* Gold gradient hairline mirroring the dock's top hairline */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent pointer-events-none" />
          </header>
          {moreSheet}

          <main className={cn("overflow-x-hidden pt-4 sm:pt-6", !hideDock && "pb-28 md:pb-24")}>
            <Outlet />
          </main>
          {!hideDock && <BottomDock />}
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
