import { Link, useLocation, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, hasAnyRole, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Landmark, LayoutDashboard, PlusCircle, ListOrdered, Users, Wallet,
  ClipboardCheck, ScrollText, UserCog, LogOut, ShieldAlert, Activity, Bell,
} from "lucide-react";
import { NotificationsProvider } from "@/lib/notifications";
import { NotificationBell } from "@/components/app/notification-bell";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
};

const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "teller", "auditor"] },
  { to: "/app/transactions/new", label: "New transaction", icon: PlusCircle, roles: ["admin", "teller"] },
  { to: "/app/transactions", label: "Transactions", icon: ListOrdered, roles: ["admin", "teller", "auditor"] },
  { to: "/app/accounts", label: "Accounts", icon: Users, roles: ["admin", "teller", "auditor"] },
  { to: "/app/vaults", label: "Vaults", icon: Wallet, roles: ["admin", "teller", "auditor"] },
  { to: "/app/approvals", label: "Approvals", icon: ClipboardCheck, roles: ["admin"] },
  { to: "/app/me/activity", label: "My activity", icon: Activity, roles: ["admin", "teller"] },
  { to: "/app/audit", label: "Audit log", icon: ScrollText, roles: ["admin", "auditor"] },
  { to: "/app/users", label: "Users & roles", icon: UserCog, roles: ["admin"] },
  { to: "/app/settings/notifications", label: "Notifications", icon: Bell, roles: ["admin", "teller", "auditor"] },
];

export function AppShell() {
  const { session, roles, loading, signOut, user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!session) nav({ to: "/login" });
  }, [session, loading, nav]);

  if (loading || !session) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const isStaff = hasAnyRole(roles, ["admin", "teller", "auditor"]);
  if (!isStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <div className="max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-warning" />
          <h1 className="mt-3 text-xl font-semibold">No staff access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is not assigned a staff role. If you are a customer, open the customer portal instead.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="secondary"><Link to="/portal">Customer portal</Link></Button>
            <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }

  const visibleNav = NAV.filter((i) => hasAnyRole(roles, i.roles));

  return (
    <NotificationsProvider>
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-60 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
          <Landmark className="h-5 w-5" /> Vault Ledger
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {visibleNav.map((item) => {
            const active = location.pathname === item.to ||
              (item.to !== "/app" && location.pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3 text-xs">
          <div className="truncate font-medium">{user?.email}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {roles.map((r) => (
              <span key={r} className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">{r}</span>
            ))}
          </div>
          <Button onClick={() => signOut()} variant="ghost" size="sm" className="mt-2 w-full justify-start">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="hidden items-center justify-end gap-2 border-b bg-background px-4 py-2 md:flex">
          <NotificationBell />
        </div>
        <div className="border-b bg-background px-4 py-3 md:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Landmark className="h-5 w-5" /> Vault Ledger
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <Button onClick={() => signOut()} variant="ghost" size="sm"><LogOut className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {visibleNav.map((i) => (
              <Link key={i.to} to={i.to} className="whitespace-nowrap rounded border px-2 py-1 text-xs">
                {i.label}
              </Link>
            ))}
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
    <div className="border-b bg-background">
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
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