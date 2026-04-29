import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMinor, formatDateTime } from "@/lib/format";
import { ArrowDownCircle, ArrowUpCircle, PlusCircle, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/app/")({ component: Dashboard });

const CURRENCIES = ["USD", "EUR", "LYD"] as const;

function Dashboard() {
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
        title="Dashboard"
        description="Overview of vaults, customers, and recent activity."
        actions={
          <Button asChild>
            <Link to="/app/transactions/new"><PlusCircle className="h-4 w-4" /> New transaction</Link>
          </Button>
        }
      />
      <div className="space-y-6 p-6">
        {data && data.pendingCount > 0 ? (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div className="flex-1 text-sm">
                {data.pendingCount} transaction{data.pendingCount > 1 ? "s" : ""} awaiting approval.
              </div>
              <Button asChild size="sm" variant="outline"><Link to="/app/approvals">Review</Link></Button>
            </CardContent>
          </Card>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Vaults &amp; reconciliation</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {CURRENCIES.map((cur) => {
              const cash = vaultByChannelCurrency.get(`cash-${cur}`) ?? 0;
              const bank = vaultByChannelCurrency.get(`bank-${cur}`) ?? 0;
              const customer = customerTotalsByCurrency.get(cur) ?? 0;
              const matches = cash + bank === customer;
              return (
                <Card key={cur}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{cur}</span>
                      {matches ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3 text-success" /> reconciled
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> mismatch
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Row label="Cash vault" value={formatMinor(cash, cur)} />
                    <Row label="Bank vault" value={formatMinor(bank, cur)} />
                    <div className="border-t pt-2">
                      <Row label="Vaults total" value={formatMinor(cash + bank, cur)} bold />
                      <Row label="Customers total" value={formatMinor(customer, cur)} bold />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent transactions</h2>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading…</div>
              ) : data && data.recentTx.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No transactions yet.</div>
              ) : (
                <ul className="divide-y">
                  {data?.recentTx.map((tx) => (
                    <li key={tx.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      {tx.direction === "deposit" ? (
                        <ArrowDownCircle className="h-5 w-5 text-success" />
                      ) : (
                        <ArrowUpCircle className="h-5 w-5 text-destructive" />
                      )}
                      <div className="flex-1">
                        <div className="font-medium">{tx.tx_number} · {tx.direction} · {tx.channel}</div>
                        <div className="truncate text-xs text-muted-foreground">{tx.comment}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatMinor(tx.amount_minor, tx.currency)}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(tx.created_at)}</div>
                      </div>
                      <Badge variant={tx.status === "posted" ? "secondary" : tx.status === "pending" ? "outline" : "destructive"}>
                        {tx.status}
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

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}