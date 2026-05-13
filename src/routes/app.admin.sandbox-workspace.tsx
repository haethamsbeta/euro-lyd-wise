import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/admin/sandbox-workspace")({
  beforeLoad: () => {
    throw redirect({ to: "/app/admin/sandbox-multi-entry" });
  },
});
