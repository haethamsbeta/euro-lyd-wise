import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor } from "@/lib/format";
import { Banknote, Building2, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/vaults/")({ component: VaultsPage });

function VaultsPage() {
  const t = useT();
  const { data } = useQuery({
    queryKey: ["vaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, vault_channel, account_balances(currency, balance_minor)")
        .eq("kind", "vault");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader title={t("vaults.title")} description={t("vaults.subtitle")} />
      <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-2">
        {data?.map((v: any) => (
          <Card key={v.id} className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {v.vault_channel === "cash" ? <Banknote className="h-5 w-5 shrink-0" /> : <Building2 className="h-5 w-5 shrink-0" />}
                <span className="truncate">{v.name}</span>
                <span className="ms-auto shrink-0 text-xs uppercase text-muted-foreground">{t(`tx.channel.${v.vault_channel}`)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {(["USD", "EUR", "LYD"] as const).map((c) => {
                  const b = v.account_balances?.find((x: any) => x.currency === c)?.balance_minor ?? 0;
                  return (
                    <li key={c}>
                      <Link
                        to="/app/vaults/$id"
                        params={{ id: v.id }}
                        search={{ currency: c }}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[oklch(0.78_0.13_82/0.08)] focus:outline-none focus-visible:bg-[oklch(0.78_0.13_82/0.10)]"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {c}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">{v.name} · {c}</div>
                          <div className="text-xs text-muted-foreground">{t("vaults.viewTx")}</div>
                        </div>
                        <div className="ms-auto text-end font-mono text-sm font-semibold text-foreground">
                          {formatMinor(b, c)}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}