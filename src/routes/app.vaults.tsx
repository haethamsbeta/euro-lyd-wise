import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor } from "@/lib/format";
import { Banknote, Building2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/vaults")({ component: VaultsPage });

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
      <div className="grid gap-4 p-6 md:grid-cols-2">
        {data?.map((v: any) => (
          <Card key={v.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {v.vault_channel === "cash" ? <Banknote className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                {v.name}
                <span className="ms-auto text-xs uppercase text-muted-foreground">{t(`tx.channel.${v.vault_channel}`)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {(["USD", "EUR", "LYD"] as const).map((c) => {
                  const b = v.account_balances?.find((x: any) => x.currency === c)?.balance_minor ?? 0;
                  return (
                    <div key={c} className="rounded border p-3">
                      <div className="text-xs text-muted-foreground">{c}</div>
                      <div className="mt-1 font-mono">{formatMinor(b, c)}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}