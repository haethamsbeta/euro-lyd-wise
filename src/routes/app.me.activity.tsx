import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMinor, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/app/me/activity")({ component: MyActivity });

function MyActivity() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["my.activity", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at")
        .eq("created_by_user_id", user!.id)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = (data ?? []).reduce((acc, t) => {
    if (t.status !== "posted") return acc;
    const k = `${t.direction}-${t.currency}` as const;
    acc[k] = (acc[k] ?? 0) + t.amount_minor;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <PageHeader title="My activity" description="Transactions you have posted." />
      <div className="space-y-4 p-6">
        <div className="grid gap-3 md:grid-cols-3">
          {(["USD", "EUR", "LYD"] as const).map((c) => (
            <Card key={c}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{c}</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Deposits</span><span className="font-mono">{formatMinor(totals[`deposit-${c}`] ?? 0, c)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Withdrawals</span><span className="font-mono">{formatMinor(totals[`withdraw-${c}`] ?? 0, c)}</span></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2 text-left">TX #</th><th className="px-4 py-2 text-left">When</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Channel</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                {data?.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 font-mono">{t.tx_number}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDateTime(t.created_at)}</td>
                    <td className="px-4 py-2 capitalize">{t.direction}</td>
                    <td className="px-4 py-2 capitalize">{t.channel}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatMinor(t.amount_minor, t.currency)}</td>
                    <td className="px-4 py-2"><Badge variant={t.status === "posted" ? "secondary" : t.status === "pending" ? "outline" : "destructive"}>{t.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}