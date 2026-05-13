import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/admin/sandbox-multi-transaction")({
  beforeLoad: () => {
    throw redirect({ to: "/app/admin/sandbox-multi-entry" });
  },
});
