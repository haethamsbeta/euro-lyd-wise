import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { SessionTimeoutProvider } from "@/lib/session-timeout";
import { IdleWarningDialog } from "@/components/app/idle-warning-dialog";
import { RoleViewProvider } from "@/lib/role-view";

export const Route = createFileRoute("/app")({
  component: AppRoute,
  head: () => ({ meta: [{ title: "Back-office — Dahab" }] }),
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