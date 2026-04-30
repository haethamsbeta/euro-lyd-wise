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
          .select("id, tx_number, direction, channel, currency, amount_minor, status, created_at, comment, customer_account_id")
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
  // Map (channel, currency) -> vault account id, so each row in a tile can deep-link.
  const vaultIdByChannelCurrency = new Map<string, string>();
  // Fallback: any vault id for a given channel (used when that channel has no balance row for this currency yet).
  const vaultIdByChannel = new Map<string, string>();

  if (data) {
    const accById = new Map(data.accounts.map((a) => [a.id, a]));
    for (const b of data.balances) {
      const acc = accById.get(b.account_id);
      if (!acc) continue;
      if (acc.kind === "vault") {
        vaultByChannelCurrency.set(`${acc.vault_channel}-${b.currency}`, b.balance_minor);
        vaultIdByChannelCurrency.set(`${acc.vault_channel}-${b.currency}`, acc.id);
      } else {
        customerTotalsByCurrency.set(b.currency, (customerTotalsByCurrency.get(b.currency) ?? 0) + b.balance_minor);
      }
    }
    for (const a of data.accounts) {
      if (a.kind === "vault" && a.vault_channel && !vaultIdByChannel.has(a.vault_channel)) {
        vaultIdByChannel.set(a.vault_channel, a.id);
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
                    <VaultRow
                      icon={<Wallet className="h-3.5 w-3.5 text-gold" />}
                      label={t("dash.cashVault")}
                      value={formatMinor(cash, cur)}
                      vaultId={vaultIdByChannelCurrency.get(`cash-${cur}`) ?? vaultIdByChannel.get("cash")}
                    />
                    <VaultRow
                      icon={<Landmark className="h-3.5 w-3.5 text-gold" />}
                      label={t("dash.bankVault")}
                      value={formatMinor(bank, cur)}
                      vaultId={vaultIdByChannelCurrency.get(`bank-${cur}`) ?? vaultIdByChannel.get("bank")}
                    />
                    <div className="border-t border-[oklch(0.78_0.13_82/0.20)] pt-2">
                      <Link
                        to="/app/accounts"
                        className="-mx-2 flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-[oklch(0.78_0.13_82/0.10)] focus:outline-none focus-visible:bg-[oklch(0.78_0.13_82/0.10)]"
                      >
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {t("dash.customersTotal")}
                        </span>
                        <span className="font-mono font-semibold text-foreground">{formatMinor(customer, cur)}</span>
                      </Link>
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
                    <li key={tx.id}>
                      {tx.customer_account_id ? (
                        <Link
                          to="/app/accounts/$id"
                          params={{ id: tx.customer_account_id }}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-[oklch(0.78_0.13_82/0.05)] focus:outline-none focus-visible:bg-[oklch(0.78_0.13_82/0.08)]"
                        >
                          <RecentTransactionContent tx={tx} />
                        </Link>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                          <RecentTransactionContent tx={tx} />
                        </div>
                      )}
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

function VaultRow({ label, value, icon, vaultId }: { label: string; value: string; icon?: React.ReactNode; vaultId?: string }) {
  if (!vaultId) {
    return <Row label={label} value={value} icon={icon} />;
  }
  return (
    <Link
      to="/app/vaults/$id"
      params={{ id: vaultId }}
      className="-mx-2 flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-[oklch(0.78_0.13_82/0.10)] focus:outline-none focus-visible:bg-[oklch(0.78_0.13_82/0.10)]"
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-mono text-foreground/90">{value}</span>
    </Link>
  );
}