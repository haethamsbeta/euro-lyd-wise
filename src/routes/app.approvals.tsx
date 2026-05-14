import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { REALTIME_MODE, POLL_INTERVALS, DATA_BACKEND } from "@/lib/runtimeConfig";
import { api } from "@/lib/api";
import { BackendPending, isPendingError } from "@/components/app/backend-pending";
import {
  TableLoadingSkeleton,
  EmptyState,
  ErrorState,
  errorMessage,
} from "@/components/app/state-views";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/app/approvals")({
  head: () => ({ meta: [{ title: "Approvals queue — Dahab" }, { name: "description", content: "Review and approve pending Dahab transactions awaiting authorization." }] }), component: () => (
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
  const [partialReason, setPartialReason] = useState("Approved with modified amount.");
  const [modifiedEndpointPending, setModifiedEndpointPending] = useState(false);
  const PAGE = 100;
  const [offset, setOffset] = useState(0);
  const [acc, setAcc] = useState<any[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["transactions.list.v2"] });
    setAcc([]);
    setOffset(0);
    setNextOffset(null);
  }

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["approvals", offset],
    queryFn: async () => {
      // Backend contract: GET /approvals/pending MUST exclude sandbox rows
      // (is_test=true, source_system='DAHAB_TEST', test_run_id starting
      // 'TEST-', TST-H-* accounts, TST-V-* vaults). No client-side filter.
      if (DATA_BACKEND === "lambda") {
        const r = await api.approvals.pendingPaged({ limit: PAGE, offset });
        const items = (r.items ?? []).map((r: any) => ({
          id: String(r.id),
          tx_number: r.tx_number,
          direction: r.direction,
          channel: r.channel,
          currency: r.currency,
          amount_minor: Number(r.amount_minor ?? 0),
          requested_amount_minor: r.requested_amount_minor ?? null,
          review_reason: r.review_reason ?? null,
          comment: r.comment ?? "",
          created_at: r.created_at,
          customer_account_id: r.customer_account_id ?? null,
        }));
        return { items, next_offset: r.next_offset };
      }
      const { data, error } = await supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, requested_amount_minor, review_reason, comment, created_at, customer_account_id")
        .eq("status", "pending").order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const items = data ?? [];
      return { items, next_offset: items.length === PAGE ? offset + PAGE : null };
    },
    retry: false,
    refetchInterval: REALTIME_MODE === "polling" ? POLL_INTERVALS.approvals : false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!data) return;
    setNextOffset(data.next_offset);
    setAcc((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const additions = data.items.filter((r: any) => !seen.has(r.id));
      return [...prev, ...additions];
    });
  }, [data]);
  const pending = isPendingError(error);
  const rows = acc;
  const isLambda = DATA_BACKEND === "lambda";
  const writesDisabled = false; // POST /approvals/:id/approve and /reject are live
  const approve = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (isLambda) {
        await api.approvals.approve(id);
        return;
      }
      const { error } = await supabase.rpc("approve_transaction", { p_tx_id: id } as any);
      if (error) throw error;
    },
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: () => { toast.success(t("approvals.approved")); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to approve"),
  });
  const approveModified = useMutation({
    mutationFn: async ({ id, amount, reason }: { id: string; amount: number; reason: string }) => {
      if (!isLambda) {
        const { error } = await supabase.rpc("approve_transaction", {
          p_tx_id: id,
          p_approved_amount_minor: amount,
        } as any);
        if (error) throw error;
        return;
      }
      await api.approvals.approveModified(id, amount, reason);
    },
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      toast.success("Transaction approved with modified amount.");
      invalidate();
      setPartialTarget(null);
      setPartialAmount("");
      setPartialReason("Approved with modified amount.");
    },
    onError: (e: any) => {
      if (isPendingError(e)) {
        setModifiedEndpointPending(true);
        toast.error("Backend endpoint pending: POST /approvals/:id/approve-modified");
      } else {
        toast.error(e?.message ?? "Failed to approve modified amount");
      }
    },
  });
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (isLambda) {
        await api.approvals.reject(id, reason);
        return;
      }
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
      <div className="p-4 sm:p-6 space-y-3">
        {pending ? (
          <BackendPending endpoint="GET /approvals/pending" />
        ) : error && rows.length === 0 ? (
          <ErrorState
            title="Couldn't load approvals queue"
            description={errorMessage(error, "The approvals service didn't respond.")}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : (
        <Card>
          <CardContent className="p-0">
            {isLoading && rows.length === 0 ? <TableLoadingSkeleton rows={4} />
              : rows.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title={t("approvals.empty")}
                  description="Pending transactions awaiting authorization will appear here."
                />
              )
              : (
              <ul className="divide-y">
                {rows.map((row: any) => (
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
                                : row.review_reason === "over_limit_with_buffer"
                                ? "Within buffer — review"
                                : "Pending review"}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending review</Badge>
                          )}
                        </div>
                        <div className="font-mono text-sm">{formatMinor(row.amount_minor, row.currency)}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
                        <div className="break-words text-sm">{row.comment}</div>
                      </div>
                      <div className="flex gap-2 sm:shrink-0">
                        <Button
                          variant="outline"
                          className="flex-1 sm:flex-none"
                          disabled={busyId === row.id || writesDisabled}
                          title={writesDisabled ? "Approval write endpoints not enabled yet" : undefined}
                          onClick={() => { setRejectReason(""); setRejectTarget({ id: row.id, tx_number: row.tx_number }); }}
                        >{t("approvals.reject")}</Button>
                        <Button
                          variant="outline"
                          className="flex-1 sm:flex-none"
                          disabled={busyId === row.id || writesDisabled}
                          title={writesDisabled ? "Approval write endpoints not enabled yet" : undefined}
                          onClick={() => { setPartialTarget(row); setPartialAmount(String((row.amount_minor / 100).toFixed(2))); }}
                        >Partial…</Button>
                        <Button
                          className="flex-1 sm:flex-none"
                          disabled={busyId === row.id || writesDisabled}
                          title={writesDisabled ? "Approval write endpoints not enabled yet" : undefined}
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
        )}
        {!pending && nextOffset != null && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => setOffset(nextOffset)}>
              {isFetching ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
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

      <Dialog open={!!partialTarget} onOpenChange={(o) => { if (!o) { setPartialTarget(null); setPartialAmount(""); setPartialReason("Approved with modified amount."); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modify amount and approve</DialogTitle>
            <DialogDescription>
              Approve a different amount than requested for{" "}
              <span className="font-mono">{partialTarget?.tx_number}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
            <Label htmlFor="partial-reason">Reason</Label>
            <Textarea
              id="partial-reason"
              rows={3}
              value={partialReason}
              onChange={(e) => setPartialReason(e.target.value)}
              placeholder="Approved with modified amount."
            />
            {modifiedEndpointPending ? (
              <BackendPending endpoint="POST /approvals/:id/approve-modified" />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPartialTarget(null); setPartialAmount(""); setPartialReason("Approved with modified amount."); }}>Cancel</Button>
            <Button
              disabled={
                !partialTarget ||
                !(Number(partialAmount) > 0) ||
                partialReason.trim().length < 3 ||
                approveModified.isPending ||
                modifiedEndpointPending
              }
              onClick={() => {
                if (!partialTarget) return;
                const minor = Math.round(Number(partialAmount) * 100);
                approveModified.mutate({ id: partialTarget.id, amount: minor, reason: partialReason.trim() });
              }}
            >Approve modified</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}