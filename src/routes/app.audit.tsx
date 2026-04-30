import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatMinor } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ExportPdfButton } from "@/components/app/export-pdf";

export const Route = createFileRoute("/app/audit")({
  component: () => <RoleGate allow={["admin", "auditor"]}><Audit /></RoleGate>,
});

type AuditRow = {
  id: string;
  action: string;
  target: string | null;
  details: any;
  created_at: string;
  actor_user_id: string | null;
};

function actionLabel(action: string): { label: string; tone: string } {
  switch (action) {
    case "tx.post":
      return { label: "Transaction posted", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
    case "tx.reverse":
      return { label: "Transaction reversed", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
    case "tx.correct":
      return { label: "Transaction corrected", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400" };
    case "tx.reject":
      return { label: "Transaction rejected", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-400" };
    case "tx.create":
      return { label: "Transaction created", tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300" };
    default:
      return { label: action, tone: "bg-muted text-muted-foreground" };
  }
}

function describe(action: string, d: any, actorName: string): string {
  const actor = actorName || "A staff member";
  const amt = (minor: any, ccy: any) =>
    typeof minor === "number" && ccy ? formatMinor(minor, String(ccy)) : "an amount";
  switch (action) {
    case "tx.post": {
      const dir = d?.direction === "withdraw" ? "withdrawal" : d?.direction === "deposit" ? "deposit" : "transaction";
      const channel = d?.channel ? ` via ${String(d.channel).replace(/_/g, " ")}` : "";
      return `${actor} posted a ${dir} of ${amt(d?.amount_minor, d?.currency)}${channel}.`;
    }
    case "tx.reverse": {
      const orig = d?.original_tx_number ? ` ${d.original_tx_number}` : "";
      const rev = d?.reversal_tx_number ? ` (reversal ${d.reversal_tx_number})` : "";
      const reason = d?.reason ? ` Reason: "${d.reason}".` : "";
      return `${actor} reversed transaction${orig} for ${amt(d?.amount_minor, d?.currency)}${rev}.${reason}`;
    }
    case "tx.correct": {
      const orig = d?.original_tx_number ? ` ${d.original_tx_number}` : "";
      const corrected = d?.corrected_tx_number ? ` New entry: ${d.corrected_tx_number}.` : "";
      const oldA = amt(d?.old_amount_minor, d?.currency);
      const newA = amt(d?.new_amount_minor, d?.currency);
      const change = d?.old_amount_minor !== d?.new_amount_minor ? ` Amount changed from ${oldA} to ${newA}.` : "";
      const reason = d?.reason ? ` Reason: "${d.reason}".` : "";
      return `${actor} corrected transaction${orig}.${change}${corrected}${reason}`;
    }
    case "tx.reject": {
      const reason = d?.reason ? ` Reason: "${d.reason}".` : "";
      return `${actor} rejected the pending transaction.${reason}`;
    }
    default:
      return `${actor} performed ${action}.`;
  }
}

function Audit() {
  const { data } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, target, details, created_at, actor_user_id")
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_user_id).filter(Boolean) as string[]));
  const { data: profiles } = useQuery({
    queryKey: ["audit-profiles", actorIds],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const nameOf = (id: string | null) =>
    (id && profiles?.find((p) => p.id === id)?.full_name) || "";

  return (
    <div>
      <PageHeader title="Audit log" description="A plain-language record of every change in the system." />
      <div className="p-4 sm:p-6 space-y-3">
        <div className="flex justify-end">
          <ExportPdfButton
            title="Audit Log"
            filenamePrefix="audit-log"
            columns={[
              { header: "Date & Time", width: 110 },
              { header: "Action", width: 110 },
              { header: "Actor", width: 110 },
              { header: "Target", width: 110 },
              { header: "Description" },
            ]}
            buildRows={async (from, to) => {
              const { data: rows, error } = await supabase
                .from("audit_log")
                .select("id, action, target, details, created_at, actor_user_id")
                .gte("created_at", from.toISOString())
                .lte("created_at", to.toISOString())
                .order("created_at", { ascending: false })
                .limit(5000);
              if (error) throw error;
              const ids = Array.from(
                new Set((rows ?? []).map((r) => r.actor_user_id).filter(Boolean) as string[]),
              );
              let nameMap = new Map<string, string>();
              if (ids.length > 0) {
                const { data: profs } = await supabase
                  .from("profiles").select("id, full_name").in("id", ids);
                (profs ?? []).forEach((p) => nameMap.set(p.id, p.full_name || ""));
              }
              return (rows ?? []).map((r: any) => {
                const actor = (r.actor_user_id && nameMap.get(r.actor_user_id)) || "";
                return [
                  formatDateTime(r.created_at),
                  actionLabel(r.action).label,
                  actor || "—",
                  r.target || "—",
                  describe(r.action, r.details, actor),
                ];
              });
            }}
          />
        </div>
        {data?.map((r) => {
          const meta = actionLabel(r.action);
          const actor = nameOf(r.actor_user_id);
          const sentence = describe(r.action, r.details, actor);
          return (
            <Card key={r.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge className={`${meta.tone} border-0`}>{meta.label}</Badge>
                  <span>{formatDateTime(r.created_at)}</span>
                  {actor && <span>· by <span className="text-foreground font-medium">{actor}</span></span>}
                  {r.target && <span>· <span className="font-mono">{r.target}</span></span>}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{sentence}</p>
                {r.details && Object.keys(r.details).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                      View raw details
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-3 text-xs">
{JSON.stringify(r.details, null, 2)}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}
        {data && data.length === 0 && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No audit entries yet.</CardContent></Card>
        )}
      </div>
    </div>
  );
}