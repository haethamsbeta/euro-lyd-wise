import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RoleGate } from "@/components/app/app-shell";
import { NewTransactionWizard, useInitialTypeFromSearch } from "@/components/app/new-transaction-wizard";

const searchSchema = z.object({
  type: z.enum(["deposit", "withdraw"]).optional(),
});

export const Route = createFileRoute("/app/transactions/new/")({
  head: () => ({ meta: [{ title: "New transaction — Dahab" }, { name: "description", content: "Choose a transaction type to post into the Dahab ledger." }] }), validateSearch: (s) => searchSchema.parse(s),
  component: NewTxPage,
  head: () => ({ meta: [{ title: "New transaction" }] }),
});

function NewTxPage() {
  const initialType = useInitialTypeFromSearch();
  return (
    <RoleGate allow={["admin", "teller"]}>
      <NewTransactionWizard initialType={initialType} />
    </RoleGate>
  );
}
