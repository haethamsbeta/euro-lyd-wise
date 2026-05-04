import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Banknote, Building2 } from "lucide-react";
import { formatMinor, formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";

type VaultSearch = { currency?: "USD" | "EUR" | "LYD" };

export const Route = createFileRoute("/app/vaults/$id")({
  component: VaultDetail,
  validateSearch: (search: Record<string, unknown>): VaultSearch => {
    const c = search.currency;
    if (c === "USD" || c === "EUR" || c === "LYD") return { currency: c };
    return {};
  },
});

function VaultDetail() {
  const t = useT();
  const { id } = Route.useParams();
  const { currency } = Route.useSearch();

  const { data: vault } = useQuery({
    queryKey: ["vault.detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, vault_channel, status, account_balances(currency, balance_minor)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: tx } = useQuery({
    queryKey: ["vault.tx", id, currency ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, customer_account_id, accounts:customer_account_id(name, account_number)")
        .eq("vault_account_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (currency) q = q.eq("currency", currency);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const Icon = vault?.vault_channel === "cash" ? Banknote : Building2;
  const titleSuffix = currency ? ` · ${currency}` : "";

  return (
    <div>
      <PageHeader
        title={vault ? `${vault.name}${titleSuffix}` : "Vault"}
        description={vault ? `${vault.vault_channel} vault · ${vault.status}` : ""}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/vaults"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
        }
      />
      <div className="space-y-6 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon className="h-5 w-5" /> {currency ? `${t("vaults.balance")} · ${currency}` : "Balances"}
              {currency ? (
                <Link
                  to="/app/vaults/$id"
                  params={{ id }}
                  search={{}}
                  className="ms-auto text-xs font-normal text-gold hover:underline"
                >
                  {t("vaults.viewAllCurrencies")}
                </Link>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={currency ? "" : "grid gap-3 sm:grid-cols-3"}>
              {(currency ? [currency] : (["USD", "EUR", "LYD"] as const)).map((c) => {
                const b = vault?.account_balances?.find((x: any) => x.currency === c)?.balance_minor ?? 0;
                return (
                  <div key={c} className={currency ? "rounded-md border p-6" : "rounded-md border p-4"}>
                    <div className="text-xs text-muted-foreground">{c}</div>
                    <div className={currency ? "mt-2 font-mono text-3xl font-semibold" : "mt-1 font-mono text-xl"}>{formatMinor(b, c)}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Transaction history</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start">TX #</th>
                    <th className="px-4 py-2 text-start">When</th>
                    <th className="px-4 py-2 text-start">Customer</th>
                    <th className="px-4 py-2 text-start">Type</th>
                    <th className="px-4 py-2 text-end">Amount</th>
                    <th className="px-4 py-2 text-start">Status</th>
                    <th className="px-4 py-2 text-start">Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tx && tx.length === 0 ? (
                    <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No transactions yet.</td></tr>
                  ) : tx?.map((t: any) => {
                    // Vault perspective: deposits TO customer = OUT of vault, withdrawals FROM customer = IN to vault
                    const intoVault = t.direction === "withdraw";
                    return (
                      <tr key={t.id}>
                        <td className="px-4 py-2 font-mono">{t.tx_number}</td>
                        <td className="px-4 py-2 text-muted-foreground">{formatDateTime(t.created_at)}</td>
                        <td className="px-4 py-2">
                          {t.accounts ? (
                            <span>{t.accounts.name} <span className="text-xs text-muted-foreground">#{t.accounts.account_number}</span></span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 capitalize">{t.direction}</td>
                        <td className={`px-4 py-2 text-end font-mono ${intoVault ? "text-success" : "text-destructive"}`}>
                          {intoVault ? "+" : "−"}{formatMinor(t.amount_minor, t.currency)}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={t.status === "posted" ? "secondary" : t.status === "pending" ? "outline" : "destructive"}>{t.status}</Badge>
                        </td>
                        <td className="max-w-sm truncate px-4 py-2 text-muted-foreground">{t.comment}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}