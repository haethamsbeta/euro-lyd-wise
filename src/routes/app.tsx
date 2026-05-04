import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { SessionTimeoutProvider } from "@/lib/session-timeout";
import { IdleWarningDialog } from "@/components/app/idle-warning-dialog";

export const Route = createFileRoute("/app")({
  component: AppRoute,
  head: () => ({ meta: [{ title: "Back-office — Dahab" }] }),
});

function AppRoute() {
  return (
    <SessionTimeoutProvider>
      <AppShell />
      <IdleWarningDialog />
    </SessionTimeoutProvider>
  );
}