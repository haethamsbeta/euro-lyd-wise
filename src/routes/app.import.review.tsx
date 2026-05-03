import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useDebounced } from "@/hooks/use-debounced";

export const Route = createFileRoute("/app/import/review")({ component: ReviewPage });

const CURRENCIES = ["USD", "EUR", "GBP", "LYD"];

function ReviewPage() {
  return (
    <RoleGate allow={["admin"]}>
      <PageHeader title="Import review queue" description="Resolve uncertain rows before they're linked to holders." />
      <ReviewList />
    </RoleGate>
  );
}

function ReviewList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_link_review_queue")
        .select("*")
        .eq("review_status", "PENDING")
        .order("id", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resolve = useMutation({
    mutationFn: async (args: { id: number; decision: any }) => {
      const { error } = await supabase.rpc("resolve_review_row", { p_row_id: args.id, p_decision: args.decision });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Row resolved");
      qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="space-y-3 p-4 sm:p-6">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Review queue is empty.</p>
      ) : (
        data!.map((row) => (
          <ReviewRow key={row.id} row={row} onResolve={(decision) => resolve.mutate({ id: row.id, decision })} pending={resolve.isPending} />
        ))
      )}
    </div>
  );
}

function ReviewRow({ row, onResolve, pending }: { row: any; onResolve: (d: any) => void; pending: boolean }) {
  const [currency, setCurrency] = useState<string>(row.extracted_currency_code && row.extracted_currency_code !== "UNK" ? row.extracted_currency_code : "");
  const [canonical, setCanonical] = useState<string>(row.base_name_candidate ?? row.raw_name ?? "");
  const [holderQuery, setHolderQuery] = useState("");
  const dq = useDebounced(holderQuery, 250);

  const { data: holders } = useQuery({
    queryKey: ["holder-search", dq],
    enabled: dq.trim().length > 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name")
        .or(`canonical_name.ilike.%${dq}%,normalized_name.ilike.%${dq}%,dahab_account_number.ilike.%${dq}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const validCurrency = currency && currency !== "UNK";

  return (
    <Card className="card-luxe">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-xs text-muted-foreground">Account #{row.source_account_number}</div>
            <div className="mt-1 text-base" dir="rtl">{row.raw_name}</div>
            <div className="mt-1 text-xs text-muted-foreground">conf {row.confidence_score} · detected {row.extracted_currency_code}</div>
          </div>
          <Badge variant="outline">{row.review_status}</Badge>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-muted-foreground">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded border bg-background px-2 py-1 text-sm">
              <option value="">—</option>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-[oklch(0.82_0.14_85/0.15)] p-3">
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Assign to existing holder</div>
            <Input value={holderQuery} onChange={e => setHolderQuery(e.target.value)} placeholder="Search by name or DAHAB #" />
            <div className="mt-2 space-y-1">
              {(holders ?? []).map(h => (
                <button
                  key={h.id}
                  type="button"
                  disabled={!validCurrency || pending}
                  onClick={() => onResolve({ action: "assign", holder_id: h.id, currency_code: currency })}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-[oklch(0.82_0.14_85/0.08)] disabled:opacity-50"
                >
                  <span dir="auto">{h.canonical_name}</span>
                  <span className="font-mono text-xs text-gold">{h.dahab_account_number}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded border border-[oklch(0.82_0.14_85/0.15)] p-3">
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Create new holder</div>
            <Input value={canonical} onChange={e => setCanonical(e.target.value)} dir="auto" placeholder="Canonical name" />
            <Button
              size="sm"
              className="mt-2 w-full"
              disabled={!validCurrency || !canonical.trim() || pending}
              onClick={() => onResolve({ action: "create", canonical_name: canonical.trim(), currency_code: currency })}
            >
              Create + link
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onResolve({ action: "reject" })}>Reject row</Button>
        </div>
      </CardContent>
    </Card>
  );
}
