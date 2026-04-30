import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMinor, formatDateTime } from "@/lib/format";
import { ArrowDownCircle, ArrowUpCircle, PlusCircle, CheckCircle2, AlertTriangle, Wallet, Landmark, Users } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/")({ component: Dashboard });

const CURRENCIES = ["USD", "EUR", "LYD"] as const;

function Dashboard() {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [accounts, balances, recentTx, pending] = await Promise.all([
        supabase.from("accounts").select("id, kind, name, vault_channel"),
        supabase.from("account_balances").select("account_id, currency, balance_minor"),
        supabase
          .from("transactions")
          .select("id, tx_number, direction, channel, currency, amount_minor, status, created_at, comment")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      return {
        accounts: accounts.data ?? [],
        balances: balances.data ?? [],
        recentTx: recentTx.data ?? [],
        pendingCount: pending.count ?? 0,
      };
    },
  });

  const vaultByChannelCurrency = new Map<string, number>();
  const customerTotalsByCurrency = new Map<string, number>();

  if (data) {
    const accById = new Map(data.accounts.map((a) => [a.id, a]));
    for (const b of data.balances) {
      const acc = accById.get(b.account_id);
      if (!acc) continue;
      if (acc.kind === "vault") {
        vaultByChannelCurrency.set(`${acc.vault_channel}-${b.currency}`, b.balance_minor);
      } else {
        customerTotalsByCurrency.set(b.currency, (customerTotalsByCurrency.get(b.currency) ?? 0) + b.balance_minor);
      }
    }
  }

  return (
    <div>
      <PageHeader
        title={t("dash.title")}
        description={t("dash.subtitle")}
        actions={
          <Button asChild>
            <Link to="/app/transactions/new"><PlusCircle className="h-4 w-4" /> {t("dash.newTransaction")}</Link>
          </Button>
        }
      />
      <div className="space-y-6 p-4 sm:p-6">
        {data && data.pendingCount > 0 ? (
          <Card className="border-warning/50 bg-warning/10 shadow-gold">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/20 ring-1 ring-warning/40">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
                {data.pendingCount} {data.pendingCount > 1 ? t("dash.pendingMany") : t("dash.pendingOne")}
              </div>
              <Button asChild size="sm" variant="outline" className="ms-auto"><Link to="/app/approvals">{t("dash.review")}</Link></Button>
            </CardContent>
          </Card>
        ) : null}

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("dash.vaultsRecon")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CURRENCIES.map((cur) => {
              const cash = vaultByChannelCurrency.get(`cash-${cur}`) ?? 0;
              const bank = vaultByChannelCurrency.get(`bank-${cur}`) ?? 0;
              const customer = customerTotalsByCurrency.get(cur) ?? 0;
              const matches = cash + bank === customer;
              const total = cash + bank;
              return (
                <Card key={cur} className="card-luxe overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="font-serif text-lg tracking-wide text-gold">{cur}</span>
                      {matches ? (
                        <Badge variant="secondary" className="gap-1 border border-success/30 bg-success/10 text-success">
                          <CheckCircle2 className="h-3 w-3" /> {t("dash.reconciled")}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {t("dash.mismatch")}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="rounded-lg border border-[oklch(0.78_0.13_82/0.25)] bg-[oklch(0.78_0.13_82/0.06)] p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t("dash.vaultsTotal")}
                      </div>
                      <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
                        {formatMinor(total, cur)}
                      </div>
                    </div>
                    <Row icon={<Wallet className="h-3.5 w-3.5 text-gold" />} label={t("dash.cashVault")} value={formatMinor(cash, cur)} />
                    <Row icon={<Landmark className="h-3.5 w-3.5 text-gold" />} label={t("dash.bankVault")} value={formatMinor(bank, cur)} />
                    <div className="border-t border-[oklch(0.78_0.13_82/0.20)] pt-2">
                      <Row icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />} label={t("dash.customersTotal")} value={formatMinor(customer, cur)} bold />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("dash.recentTx")}</h2>
          <Card className="card-luxe">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
              ) : data && data.recentTx.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">{t("dash.noTx")}</div>
              ) : (
                <ul className="divide-y divide-[oklch(0.78_0.13_82/0.15)]">
                  {data?.recentTx.map((tx) => (
                    <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-[oklch(0.78_0.13_82/0.05)]">
                      <div className={
                        tx.direction === "deposit"
                          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 ring-1 ring-success/30"
                          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 ring-1 ring-destructive/30"
                      }>
                        {tx.direction === "deposit" ? (
                          <ArrowDownCircle className="h-5 w-5 text-success" />
                        ) : (
                          <ArrowUpCircle className="h-5 w-5 text-destructive" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-foreground">{tx.tx_number} · {t(`tx.direction.${tx.direction}`)} · {t(`tx.channel.${tx.channel}`)}</div>
                        {tx.comment ? <div className="truncate text-xs text-muted-foreground">{tx.comment}</div> : null}
                      </div>
                      <div className="ms-auto text-end">
                        <div className="font-mono text-base font-semibold text-foreground">{formatMinor(tx.amount_minor, tx.currency)}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(tx.created_at)}</div>
                      </div>
                      <Badge className="shrink-0" variant={tx.status === "posted" ? "secondary" : tx.status === "pending" ? "outline" : "destructive"}>
                        {t(`tx.status.${tx.status}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, bold, icon }: { label: string; value: string; bold?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={"font-mono " + (bold ? "font-semibold text-foreground" : "text-foreground/90")}>{value}</span>
    </div>
  );
}