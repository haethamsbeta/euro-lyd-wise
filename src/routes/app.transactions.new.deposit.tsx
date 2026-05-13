import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/transactions/new/deposit")({
  head: () => ({ meta: [{ title: "New deposit — Dahab" }, { name: "description", content: "Post a new customer deposit into the Dahab ledger." }] }), beforeLoad: () => {
    throw redirect({ to: "/app/transactions/new", search: { type: "deposit" } });
  },
});
