import { createFileRoute } from "@tanstack/react-router";
import { EntryForm } from "@/components/app/entry-form";
import { RoleGate } from "@/components/app/app-shell";

export const Route = createFileRoute("/app/transactions/new/withdraw")({
  component: () => (
    <RoleGate allow={["admin", "teller"]}>
      <EntryForm direction="withdraw" />
    </RoleGate>
  ),
  head: () => ({ meta: [{ title: "New withdrawal" }] }),
});