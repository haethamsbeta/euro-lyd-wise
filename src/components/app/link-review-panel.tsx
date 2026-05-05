import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export function LinkReviewPanel({ holderId }: { holderId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["link-review", holderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_link_review_queue")
        .select("id,raw_name,source_account_number,extracted_currency_code,normalized_name_candidate,base_name_candidate,confidence_score,review_status,created_at")
        .eq("suggested_account_holder_id", holderId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: number; approve: boolean }) => {
      const { error } = await supabase.rpc("resolve_review_row", {
        p_row_id: id,
        p_decision: { action: approve ? "approve" : "reject", account_holder_id: holderId } as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Decision recorded");
      qc.invalidateQueries({ queryKey: ["link-review", holderId] });
      qc.invalidateQueries({ queryKey: ["holder", holderId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <Card className="card-luxe">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-serif text-base">Link review</h3>
            <p className="text-xs text-muted-foreground">Imported rows the system suggested for this holder. Approve to attach, reject to dismiss.</p>
          </div>
          <Badge variant="secondary">{data.length}</Badge>
        </div>
        <div className="space-y-2">
          {data.map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border border-[oklch(0.82_0.14_85/0.18)] p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {r.extracted_currency_code ? <Badge>{r.extracted_currency_code}</Badge> : null}
                  {r.source_account_number ? <span className="font-mono text-xs">{r.source_account_number}</span> : null}
                  {typeof r.confidence_score === "number" ? (
                    <Badge variant="outline" className="text-xs">conf {Math.round(r.confidence_score * 100)}%</Badge>
                  ) : null}
                  <Badge variant="outline" className="text-xs">{r.review_status}</Badge>
                </div>
                <div className="mt-1 truncate" dir="auto">{r.raw_name}</div>
                {r.base_name_candidate ? <div className="text-xs text-muted-foreground">→ {r.base_name_candidate}</div> : null}
              </div>
              {r.review_status === "PENDING" ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: r.id, approve: true })} disabled={decide.isPending}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: r.id, approve: false })} disabled={decide.isPending}>
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
