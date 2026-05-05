import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/$accountId/$currency")({
  beforeLoad: () => { throw redirect({ to: "/portal" }); },
  component: () => null,
});
