import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMinor, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/approvals")({
  component: () => (
    <RoleGate allow={["admin"]}>
      <Approvals />
    </RoleGate>
  ),
});

function Approvals() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, comment, created_at, customer_account_id")
        .eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("approve_transaction", { p_tx_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("approvals.approved")); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_transaction", { p_tx_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("approvals.rejected")); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title={t("approvals.title")} description={t("approvals.subtitle")} />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            {isLoading ? <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
              : data && data.length === 0 ? <div className="p-6 text-sm text-muted-foreground">{t("approvals.empty")}</div>
              : (
              <ul className="divide-y">
                {data!.map((row) => (
                  <li key={row.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{row.tx_number}</span>
                          <Badge variant="outline">{t(`tx.direction.${row.direction}`)}</Badge>
                          <Badge variant="outline">{t(`tx.channel.${row.channel}`)}</Badge>
                        </div>
                        <div className="text-sm">{formatMinor(row.amount_minor, row.currency)}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
                        <div className="text-sm">{row.comment}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => {
                          const r = window.prompt(t("approvals.rejectPrompt"));
                          if (r && r.trim()) reject.mutate({ id: row.id, reason: r.trim() });
                        }}>{t("approvals.reject")}</Button>
                        <Button onClick={() => approve.mutate(row.id)}>{t("approvals.approve")}</Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}