import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMinor, formatDateTime, parseAmountToMinor } from "@/lib/format";
import { Pencil, Search, ShieldAlert } from "lucide-react";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/app/transactions/")({ component: TxList });

type Tx = {
  id: string;
  tx_number: string;
  direction: "deposit" | "withdraw";
  channel: "cash" | "bank";
  currency: "USD" | "EUR" | "LYD";
  amount_minor: number;
  status: "posted" | "pending" | "rejected" | "reversed";
  comment: string;
  created_at: string;
  customer_account_id: string;
  reverses_tx_id: string | null;
  corrected_by_tx_id: string | null;
};

function TxList() {
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Tx | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["transactions.list", q],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(
          "id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, customer_account_id, reverses_tx_id, corrected_by_tx_id",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (q.trim()) query = query.ilike("tx_number", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="All posted, pending, rejected, and reversed entries."
      />
      <div className="space-y-4 p-6">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by TX number…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">TX #</th>
                    <th className="px-4 py-2 text-left">When</th>
                    <th className="px-4 py-2 text-left">Direction</th>
                    <th className="px-4 py-2 text-left">Channel</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Comment</th>
                    {isAdmin ? <th className="px-4 py-2 text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoading ? (
                    <tr>
                      <td colSpan={isAdmin ? 8 : 7} className="p-4 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : data && data.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 8 : 7} className="p-4 text-center text-muted-foreground">
                        No transactions.
                      </td>
                    </tr>
                  ) : (
                    data!.map((tx) => {
                      const canEdit =
                        isAdmin &&
                        tx.status === "posted" &&
                        !tx.reverses_tx_id &&
                        !tx.corrected_by_tx_id;
                      return (
                        <tr key={tx.id}>
                          <td className="px-4 py-2 font-mono">{tx.tx_number}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {formatDateTime(tx.created_at)}
                          </td>
                          <td className="px-4 py-2 capitalize">{tx.direction}</td>
                          <td className="px-4 py-2 capitalize">{tx.channel}</td>
                          <td className="px-4 py-2 text-right font-mono">
                            {formatMinor(tx.amount_minor, tx.currency)}
                          </td>
                          <td className="px-4 py-2">
                            <StatusBadge tx={tx} />
                          </td>
                          <td className="max-w-md truncate px-4 py-2 text-muted-foreground">
                            {tx.comment}
                          </td>
                          {isAdmin ? (
                            <td className="px-4 py-2 text-right">
                              {canEdit ? (
                                <Button size="sm" variant="outline" onClick={() => setEditing(tx)}>
                                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <CorrectionDialog tx={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function StatusBadge({ tx }: { tx: Tx }) {
  if (tx.status === "reversed") {
    return (
      <Badge variant="outline" className="border-warning/40 text-warning">
        reversed
      </Badge>
    );
  }
  if (tx.reverses_tx_id) {
    return (
      <Badge variant="outline" className="border-warning/40 text-warning">
        reversal
      </Badge>
    );
  }
  return (
    <Badge
      variant={
        tx.status === "posted"
          ? "secondary"
          : tx.status === "pending"
            ? "outline"
            : "destructive"
      }
    >
      {tx.status}
    </Badge>
  );
}

function CorrectionDialog({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (tx) {
      setAmount((tx.amount_minor / 100).toFixed(2));
      setComment(tx.comment);
      setReason("");
    }
  }, [tx]);

  const amountMinor = useMemo(() => parseAmountToMinor(amount), [amount]);
  const trimmedComment = comment.trim();
  const trimmedReason = reason.trim();
  const ready =
    !!tx &&
    amountMinor !== null &&
    amountMinor > 0 &&
    trimmedComment.length >= 3 &&
    trimmedReason.length >= 10;

  const correct = useMutation({
    mutationFn: async () => {
      if (!tx) throw new Error("No transaction selected");
      const { data, error } = await supabase.rpc("correct_transaction" as any, {
        p_tx_id: tx.id,
        p_new_amount_minor: amountMinor!,
        p_new_comment: trimmedComment,
        p_correction_reason: trimmedReason,
      } as any);
      if (error) throw error;
      return data;
    },
    onSuccess: (newTx: any) => {
      qc.invalidateQueries();
      toast.success(
        newTx?.status === "posted"
          ? `Corrected → ${newTx.tx_number}`
          : `Correction queued for approval → ${newTx?.tx_number ?? ""}`,
      );
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Correction failed"),
  });

  return (
    <Dialog open={!!tx} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct transaction</DialogTitle>
          <DialogDescription>
            Posted entries are immutable. This will post a reversing entry that cancels{" "}
            <span className="font-mono">{tx?.tx_number}</span>, then post a new corrected entry.
            Both stay in the ledger and audit log.
          </DialogDescription>
        </DialogHeader>

        {tx ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Direction</div>
                  <div className="capitalize">{tx.direction}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Channel</div>
                  <div className="capitalize">{tx.channel}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Currency</div>
                  <div>{tx.currency}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Original amount</div>
                  <div className="font-mono">{formatMinor(tx.amount_minor, tx.currency)}</div>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="new-amount">Corrected amount ({tx.currency})</Label>
              <Input
                id="new-amount"
                inputMode="decimal"
                className="mt-1.5"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {amount && amountMinor === null ? (
                <p className="mt-1 text-xs text-destructive">
                  Enter a valid amount (max 2 decimals).
                </p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="new-comment">Corrected comment</Label>
              <Input
                id="new-comment"
                className="mt-1.5"
                value={comment}
                maxLength={280}
                onChange={(e) => setComment(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {trimmedComment.length < 3
                  ? `Need ${3 - trimmedComment.length} more character${trimmedComment.length === 2 ? "" : "s"}`
                  : "Looks good"}
              </p>
            </div>

            <div>
              <Label htmlFor="reason">Correction reason (audited)</Label>
              <Textarea
                id="reason"
                rows={3}
                className="mt-1.5"
                placeholder="Explain why this correction is needed (min 10 chars). This is recorded in the audit log."
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {trimmedReason.length < 10
                  ? `Need ${10 - trimmedReason.length} more character${trimmedReason.length === 9 ? "" : "s"}`
                  : "Looks good"}
              </p>
            </div>

            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Financial controls still apply</AlertTitle>
              <AlertDescription>
                If the corrected amount overdrafts the account or exceeds its debit limit, the
                new entry will be queued for admin approval — the original is reversed either way.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={correct.isPending}>
            Cancel
          </Button>
          <Button onClick={() => correct.mutate()} disabled={!ready || correct.isPending}>
            {correct.isPending ? "Correcting…" : "Reverse & post correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
