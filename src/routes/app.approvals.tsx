import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { formatMinor, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { REALTIME_MODE, POLL_INTERVALS } from "@/lib/runtimeConfig";

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
  const [rejectTarget, setRejectTarget] = useState<{ id: string; tx_number: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [partialTarget, setPartialTarget] = useState<any | null>(null);
  const [partialAmount, setPartialAmount] = useState("");

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["transactions.list.v2"] });
  }

  const { data, isLoading } = useQuery({
    queryKey: ["approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, requested_amount_minor, review_reason, comment, created_at, customer_account_id")
        .eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: REALTIME_MODE === "polling" ? POLL_INTERVALS.approvals : false,
    refetchOnWindowFocus: true,
  });
  const approve = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount?: number }) => {
      const { error } = await supabase.rpc("approve_transaction", {
        p_tx_id: id,
        ...(amount != null ? { p_approved_amount_minor: amount } : {}),
      } as any);
      if (error) throw error;
    },
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: () => { toast.success(t("approvals.approved")); invalidate(); setPartialTarget(null); setPartialAmount(""); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to approve"),
  });
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_transaction", { p_tx_id: id, p_reason: reason });
      if (error) throw error;
    },
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      toast.success(t("approvals.rejected"));
      invalidate();
      setRejectTarget(null);
      setRejectReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reject"),
  });

  return (
    <div>
      <PageHeader title={t("approvals.title")} description={t("approvals.subtitle")} />
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-0">
            {isLoading ? <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
              : data && data.length === 0 ? <div className="p-6 text-sm text-muted-foreground">{t("approvals.empty")}</div>
              : (
              <ul className="divide-y">
                {data!.map((row) => (
                  <li key={row.id} className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm">{row.tx_number}</span>
                          <Badge variant="outline">{t(`tx.direction.${row.direction}`)}</Badge>
                          <Badge variant="outline">{t(`tx.channel.${row.channel}`)}</Badge>
                          {row.review_reason ? (
                            <Badge
                              variant={row.review_reason === "over_limit_with_buffer" ? "secondary" : "destructive"}
                            >
                              {row.review_reason === "insufficient_balance"
                                ? "Insufficient balance"
                                : row.review_reason === "exceeds_withdraw_limit"
                                ? "Over withdrawal limit"
                                : "Within buffer — review"}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="font-mono text-sm">{formatMinor(row.amount_minor, row.currency)}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
                        <div className="break-words text-sm">{row.comment}</div>
                      </div>
                      <div className="flex gap-2 sm:shrink-0">
                        <Button
                          variant="outline"
                          className="flex-1 sm:flex-none"
                          disabled={busyId === row.id}
                          onClick={() => { setRejectReason(""); setRejectTarget({ id: row.id, tx_number: row.tx_number }); }}
                        >{t("approvals.reject")}</Button>
                        <Button
                          variant="outline"
                          className="flex-1 sm:flex-none"
                          disabled={busyId === row.id}
                          onClick={() => { setPartialTarget(row); setPartialAmount(String((row.amount_minor / 100).toFixed(2))); }}
                        >Partial…</Button>
                        <Button
                          className="flex-1 sm:flex-none"
                          disabled={busyId === row.id}
                          onClick={() => approve.mutate({ id: row.id })}
                        >
                          {busyId === row.id && approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {t("approvals.approve")}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("approvals.rejectTitle")}</DialogTitle>
            <DialogDescription>
              {t("approvals.rejectDescription")} <span className="font-mono">{rejectTarget?.tx_number}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">{t("approvals.rejectReason")}</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t("approvals.rejectPlaceholder")}
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 3 || reject.isPending}
              onClick={() => rejectTarget && reject.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })}
            >
              {reject.isPending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
              {t("approvals.confirmReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!partialTarget} onOpenChange={(o) => { if (!o) { setPartialTarget(null); setPartialAmount(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Partial approval</DialogTitle>
            <DialogDescription>
              Approve a smaller amount than requested for{" "}
              <span className="font-mono">{partialTarget?.tx_number}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Requested: <span className="font-mono">{partialTarget ? formatMinor(partialTarget.amount_minor, partialTarget.currency) : ""}</span>
            </div>
            <Label htmlFor="partial-amt">Amount to approve ({partialTarget?.currency})</Label>
            <input
              id="partial-amt"
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={partialAmount}
              onChange={(e) => setPartialAmount(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPartialTarget(null); setPartialAmount(""); }}>Cancel</Button>
            <Button
              disabled={!partialTarget || !(Number(partialAmount) > 0) || approve.isPending}
              onClick={() => {
                if (!partialTarget) return;
                const minor = Math.round(Number(partialAmount) * 100);
                approve.mutate({ id: partialTarget.id, amount: minor });
              }}
            >Approve partial</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}