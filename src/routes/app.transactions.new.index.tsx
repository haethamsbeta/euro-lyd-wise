import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/transactions/new/")({
  component: NewTxChooser,
  head: () => ({ meta: [{ title: "New transaction — choose type" }] }),
});

function NewTxChooser() {
  const nav = useNavigate();
  const t = useT();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "d" || e.key === "D") nav({ to: "/app/transactions/new/deposit" });
      if (e.key === "w" || e.key === "W") nav({ to: "/app/transactions/new/withdraw" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  return (
    <RoleGate allow={["admin", "teller"]}>
      <PageHeader
        title={t("newtx.title")}
        description={t("newtx.subtitle")}
      />
      <div className="p-6">
        <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
          <Link to="/app/transactions/new/deposit" className="block">
            <Card className="group flex h-56 flex-col items-center justify-center gap-3 border-2 border-success/30 bg-success/5 transition-all hover:border-success hover:shadow-lg">
              <ArrowDownCircle className="h-14 w-14 text-success transition-transform group-hover:scale-110" />
              <div className="text-2xl font-semibold text-success">{t("newtx.deposit")}</div>
              <p className="px-6 text-center text-sm text-muted-foreground">
                {t("newtx.depositHint")} <kbd className="rounded border px-1">D</kbd>
              </p>
            </Card>
          </Link>
          <Link to="/app/transactions/new/withdraw" className="block">
            <Card className="group flex h-56 flex-col items-center justify-center gap-3 border-2 border-destructive/30 bg-destructive/5 transition-all hover:border-destructive hover:shadow-lg">
              <ArrowUpCircle className="h-14 w-14 text-destructive transition-transform group-hover:scale-110" />
              <div className="text-2xl font-semibold text-destructive">{t("newtx.withdraw")}</div>
              <p className="px-6 text-center text-sm text-muted-foreground">
                {t("newtx.withdrawHint")} <kbd className="rounded border px-1">W</kbd>
              </p>
            </Card>
          </Link>
        </div>
      </div>
    </RoleGate>
  );
}