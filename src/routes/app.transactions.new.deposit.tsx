import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/transactions/new/deposit")({
  beforeLoad: () => {
    throw redirect({ to: "/app/transactions/new", search: { type: "deposit" } });
  },
});
