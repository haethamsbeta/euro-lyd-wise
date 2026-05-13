import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { SessionTimeoutProvider } from "@/lib/session-timeout";
import { IdleWarningDialog } from "@/components/app/idle-warning-dialog";
import { RoleViewProvider } from "@/lib/role-view";

export const Route = createFileRoute("/app")({
  component: AppRoute,
  head: () => ({
    meta: [
      { title: "Back-office — Dahab" },
      { name: "description", content: "Dahab back-office for staff: manage holders, accounts, vaults, approvals, and audit across the ledger." },
      { property: "og:title", content: "Back-office — Dahab" },
      { property: "og:description", content: "Staff workspace for Dahab: holders, accounts, vaults, approvals, and audit." },
      { property: "og:url", content: "https://dahablibya.com/app" },
    ],
  }),
});

function AppRoute() {
  return (
    <SessionTimeoutProvider>
      <RoleViewProvider>
        <AppShell />
        <IdleWarningDialog />
      </RoleViewProvider>
    </SessionTimeoutProvider>
  );
}