import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SessionTimeoutProvider } from "@/lib/session-timeout";
import { IdleWarningDialog } from "@/components/app/idle-warning-dialog";

export const Route = createFileRoute("/m")({
  component: MobileLayout,
});

function MobileLayout() {
  return (
    <SessionTimeoutProvider>
      <Outlet />
      <IdleWarningDialog />
    </SessionTimeoutProvider>
  );
}