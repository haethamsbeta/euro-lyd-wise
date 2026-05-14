import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMinor } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ExportPdfButton } from "@/components/app/export-pdf";
import { api } from "@/lib/api";
import { BackendPending, isPendingError } from "@/components/app/backend-pending";
import {
  TableLoadingSkeleton,
  EmptyState,
  ErrorState,
  errorMessage,
} from "@/components/app/state-views";
import { ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/audit")({
  head: () => ({ meta: [{ title: "Audit log — Dahab" }, { name: "description", content: "Inspect the full audit trail of changes and actions across Dahab." }] }), component: () => <RoleGate allow={["admin", "auditor"]}><Audit /></RoleGate>,
});

type AuditRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
  created_at: string;
  actor_username: string | null;
  actor_role: string | null;
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
    case "fx_rate.create":
      return { label: "FX rate created", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400" };
    case "fx_rate.update":
      return { label: "FX rate updated", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400" };
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
  const t = useT();
  const PAGE = 100;
  const [offset, setOffset] = useState(0);
  const [acc, setAcc] = useState<AuditRow[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["audit", offset],
    queryFn: async () => {
      const r = await api.audit.listPaged({ limit: PAGE, offset });
      const items = (r.items ?? []).map((row: any) => ({
        id: String(row.id),
        action: row.action,
        entity_type: row.entity_type ?? row.target_type ?? row.entity ?? null,
        entity_id: row.entity_id ?? row.target_id ?? null,
        details: row.metadata_json ?? row.metadata ?? row.meta ?? {},
        created_at: row.created_at ?? row.ts,
        actor_username: row.actor_username ?? row.user_email ?? null,
        actor_role: row.actor_role ?? null,
      })) as AuditRow[];
      return { items, next_offset: r.next_offset };
    },
    retry: false,
  });
  useEffect(() => {
    if (!data) return;
    setNextOffset(data.next_offset);
    setAcc((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const additions = data.items.filter((r) => !seen.has(r.id));
      return [...prev, ...additions];
    });
  }, [data]);
  const pending = isPendingError(error);
  const hasUnexpectedError = !!error && !pending && rows.length === 0;
  const rows = acc;

  const nameOf = (row: AuditRow) => row.actor_username || "";

  return (
    <div>
      <PageHeader title={t("audit.title")} description={t("audit.subtitle")} />
      <div className="p-4 sm:p-6 space-y-3">
        {pending && <BackendPending endpoint="GET /audit" />}
        {hasUnexpectedError && (
          <ErrorState
            title="Couldn't load audit log"
            description={errorMessage(error, "The audit service didn't respond.")}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        )}
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
              try {
                const res = await api.audit.list({
                  from: from.toISOString(),
                  to: to.toISOString(),
                  limit: 5000,
                });
                const list = Array.isArray(res) ? res : ((res as any)?.items ?? []);
                return (list ?? []).map((r: any) => {
                  const actor = r.actor_username || r.user_email || "";
                  const entityType = r.entity_type ?? r.target_type ?? r.entity ?? "";
                  const entityId = r.entity_id ?? r.target_id ?? "";
                  const target = [entityType, entityId].filter(Boolean).join(":") || "—";
                  const details = r.metadata_json ?? r.metadata ?? r.meta ?? {};
                  return [
                    formatDateTime(r.created_at ?? r.ts),
                    actionLabel(r.action).label,
                    actor || "—",
                    target,
                    describe(r.action, details, actor),
                  ];
                });
              } catch (e) {
                if (isPendingError(e)) toast.error("Backend endpoint pending: GET /audit");
                return [];
              }
            }}
          />
        </div>
        {!pending && rows.map((r) => {
          const meta = actionLabel(r.action);
          const actor = nameOf(r);
          const sentence = describe(r.action, r.details, actor);
          const target = [r.entity_type, r.entity_id].filter(Boolean).join(":");
          return (
            <Card key={r.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge className={`${meta.tone} border-0`}>{meta.label}</Badge>
                  <span>{formatDateTime(r.created_at)}</span>
                  {actor && <span>· by <span className="text-foreground font-medium">{actor}</span></span>}
                  {r.actor_role && <span>· <span className="text-foreground">{r.actor_role}</span></span>}
                  {target && <span>· <span className="font-mono">{target}</span></span>}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{sentence}</p>
                {r.details && Object.keys(r.details).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                      {t("audit.viewRaw")}
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
        {!pending && !hasUnexpectedError && rows.length === 0 && isFetching && (
          <Card><CardContent className="p-2"><TableLoadingSkeleton rows={5} /></CardContent></Card>
        )}
        {!pending && !hasUnexpectedError && rows.length === 0 && !isFetching && (
          <EmptyState
            icon={ScrollText}
            title={t("audit.empty")}
            description="Actions performed across the app will be logged here."
          />
        )}
        {!pending && nextOffset != null && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => setOffset(nextOffset)}>
              {isFetching ? t("common.loading") : t("common.loadMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}