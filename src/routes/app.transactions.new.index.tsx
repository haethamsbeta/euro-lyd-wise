import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RoleGate } from "@/components/app/app-shell";
import { ArrowDownRight, ArrowUpRight, Sparkles, Check } from "lucide-react";
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
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link to="/app" className="text-muted-foreground transition-colors hover:text-foreground">
            Dashboard
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link to="/app/transactions" className="text-muted-foreground transition-colors hover:text-foreground">
            Transactions
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-foreground">New</span>
        </div>

        {/* Title block */}
        <div className="mb-8">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold">
              New Transaction
            </span>
          </div>
          <h1 className="font-playfair text-3xl font-semibold text-foreground md:text-4xl">
            {t("newtx.title")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("newtx.subtitle")}</p>
        </div>

        {/* Type cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TypeCard
            to="/app/transactions/new/deposit"
            icon={ArrowDownRight}
            title={t("newtx.deposit")}
            desc="Receive cash or wire into a customer account"
            shortcut="D"
          />
          <TypeCard
            to="/app/transactions/new/withdraw"
            icon={ArrowUpRight}
            title={t("newtx.withdraw")}
            desc="Disburse cash or wire from a customer account"
            shortcut="W"
          />
        </div>
      </div>
    </RoleGate>
  );
}

function TypeCard({
  to,
  icon: Icon,
  title,
  desc,
  shortcut,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  shortcut: string;
}) {
  return (
    <Link
      to={to}
      className="group relative block overflow-hidden rounded-2xl border-2 border-border bg-card/70 p-6 text-left transition-all hover:border-gold/50 hover:bg-card hover:shadow-gold"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground transition-colors group-hover:bg-gradient-gold group-hover:text-[var(--surface)]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-1 font-playfair text-lg font-semibold text-foreground transition-colors group-hover:text-gold">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
      <div className="mt-5 flex items-center justify-between border-t border-gold/10 pt-3 text-xs text-muted-foreground">
        <span>Press to continue</span>
        <kbd className="rounded border border-gold/30 bg-gold/5 px-1.5 py-0.5 font-mono text-[10px] text-gold">
          {shortcut}
        </kbd>
      </div>
      <Check className="absolute right-4 top-4 h-4 w-4 text-gold opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}