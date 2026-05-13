import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMinor, formatDateTime, formatMinorOrMissing } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { api } from "@/lib/api";
import { BackendPending, isPendingError } from "@/components/app/backend-pending";

export const Route = createFileRoute("/app/me/activity")({ head: () => ({ meta: [{ title: "My activity — Dahab" }, { name: "description", content: "Personal activity history for your Dahab back-office account." }] }), component: MyActivity });

function MyActivity() {
  const t = useT();
  const { user } = useAuth();
  const { data, error } = useQuery({
    queryKey: ["my.activity", user?.id],
    enabled: !!user?.id,
    retry: false,
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const rows = await api.transactions.myRecent(200);
        return (rows ?? []).map((r: any) => ({
            id: String(r.id ?? r.transaction_id ?? crypto.randomUUID()),
            tx_number: r.tx_number ?? r.reference ?? String(r.id ?? ""),
            direction: (r.direction ?? (r.credit_minor ? "deposit" : "withdraw")) as "deposit" | "withdraw",
            channel: r.channel ?? r.transaction_category ?? "—",
            currency: (r.currency ?? r.currency_code ?? null) as string | null,
            amount_minor: r.amount_minor ?? r.credit_minor ?? r.debit_minor ?? 0,
            status: r.status ?? "posted",
            comment: r.comment ?? r.description ?? null,
            created_at: r.created_at ?? r.posted_at ?? r.ts ?? new Date().toISOString(),
          }));
      }
      const { data, error } = await supabase.from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at")
        .eq("created_by_user_id", user!.id)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lambdaPending = DATA_BACKEND === "lambda" && error && isPendingError(error);
  const totals = (data ?? []).reduce((acc, t) => {
    if (t.status !== "posted") return acc;
    if (!t.currency) return acc;
    const k = `${t.direction}-${t.currency}` as const;
    acc[k] = (acc[k] ?? 0) + t.amount_minor;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <PageHeader title={t("activity.title")} description={t("activity.subtitle")} />
      <div className="space-y-4 p-4 sm:p-6">
        {lambdaPending ? (
          <BackendPending
            endpoint="GET /transactions/me/recent"
            note="My recent activity will populate once the backend exposes this endpoint. No Supabase fallback is used in lambda mode."
          />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(["USD", "EUR", "LYD"] as const).map((c) => (
            <Card key={c}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{c}</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("activity.deposits")}</span><span className="font-mono">{formatMinor(totals[`deposit-${c}`] ?? 0, c)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("activity.withdrawals")}</span><span className="font-mono">{formatMinor(totals[`withdraw-${c}`] ?? 0, c)}</span></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2 text-start">{t("activity.col.tx")}</th><th className="px-4 py-2 text-start">{t("activity.col.when")}</th><th className="px-4 py-2">{t("activity.col.type")}</th><th className="px-4 py-2">{t("activity.col.channel")}</th><th className="px-4 py-2 text-end">{t("activity.col.amount")}</th><th className="px-4 py-2">{t("activity.col.status")}</th></tr>
              </thead>
              <tbody className="divide-y">
                {data?.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 font-mono">{row.tx_number}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDateTime(row.created_at)}</td>
                    <td className="px-4 py-2">{t(`tx.direction.${row.direction}`)}</td>
                    <td className="px-4 py-2">{t(`tx.channel.${row.channel}`)}</td>
                    <td className="px-4 py-2 text-end font-mono">{formatMinorOrMissing(row.amount_minor, row.currency)}</td>
                    <td className="px-4 py-2"><Badge variant={row.status === "posted" ? "secondary" : row.status === "pending" ? "outline" : "destructive"}>{t(`tx.status.${row.status}`)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}