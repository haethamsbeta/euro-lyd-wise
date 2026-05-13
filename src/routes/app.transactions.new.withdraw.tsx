import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/transactions/new/withdraw")({
  head: () => ({ meta: [{ title: "New withdrawal — Dahab" }, { name: "description", content: "Post a new customer withdrawal in the Dahab back-office." }] }), beforeLoad: () => {
    throw redirect({ to: "/app/transactions/new", search: { type: "withdraw" } });
  },
});
