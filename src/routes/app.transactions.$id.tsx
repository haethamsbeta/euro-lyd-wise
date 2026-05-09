import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumCard } from "@/components/ui/premium-card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatMinor, formatDateTime } from "@/lib/format";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Download,
  ExternalLink,
  RefreshCw,
  Eye,
  FileText,
  ImageIcon,
  File as FileIcon,
  Wallet,
  Building2,
  Hash,
  ShieldAlert,
  Copy,
  User as UserIcon,
} from "lucide-react";

export const Route = createFileRoute("/app/transactions/$id")({
  component: TxDetail,
});

type TxFull = {
  id: string;
  tx_number: string;
  direction: "deposit" | "withdraw";
  channel: "cash" | "bank";
  currency: string;
  amount_minor: number;
  status: string;
  comment: string;
  created_at: string;
  posted_at: string | null;
  reject_reason: string | null;
  correction_reason: string | null;
  approved_by_user_id: string | null;
  created_by_user_id: string;
  customer_account_id: string;
  reverses_tx_id: string | null;
  customer: { name: string; account_number: string } | null;
  vault: { name: string; vault_channel: string | null } | null;
};

type Attachment = {
  id: string;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  uploaded_by: string;
};

function TxDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const roles = useEffectiveRoles();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const isAuditor = hasAnyRole(roles, ["auditor"]) && !isAdmin;
  const qc = useQueryClient();

  const { data: tx, isLoading, error } = useQuery({
    queryKey: ["tx.detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, posted_at, reject_reason, correction_reason, approved_by_user_id, created_by_user_id, customer_account_id, reverses_tx_id,
           customer:accounts!transactions_customer_account_id_fkey(name, account_number),
           vault:accounts!transactions_vault_account_id_fkey(name, vault_channel)`,
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as TxFull;
    },
  });

  const { data: attachments } = useQuery({
    queryKey: ["tx.attachments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_attachments")
        .select("id, file_name, storage_path, content_type, size_bytes, created_at, uploaded_by")
        .eq("transaction_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const { data: profileMap } = useQuery({
    queryKey: ["tx.profiles", id, tx?.created_by_user_id, tx?.approved_by_user_id],
    enabled: !!tx,
    queryFn: async () => {
      const ids = [tx!.created_by_user_id, tx!.approved_by_user_id].filter(Boolean) as string[];
      if (!ids.length) return new Map<string, string>();
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const m = new Map<string, string>();
      (data ?? []).forEach((p: any) => m.set(p.id, p.full_name || ""));
      return m;
    },
  });

  const { data: audit } = useQuery({
    queryKey: ["tx.audit", id],
    enabled: !!tx,
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, action, target, details, created_at, actor_user_id")
        .eq("target", `transaction:${id}`)
        .order("created_at", { ascending: false })
        .limit(50);
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.actor_user_id).filter(Boolean)));
      let names = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        (profs ?? []).forEach((p: any) => names.set(p.id, p.full_name || ""));
      }
      return rows.map((r) => ({ ...r, actor_name: names.get(r.actor_user_id) ?? null }));
    },
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("approve_transaction" as any, { p_tx_id: id } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Approved & posted"); },
    onError: (e: any) => toast.error(e.message ?? "Approve failed"),
  });

  const reject = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.rpc("reject_transaction" as any, {
        p_tx_id: id, p_reason: reason,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Rejected"); },
    onError: (e: any) => toast.error(e.message ?? "Reject failed"),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-surface-2" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }
  if (error || !tx) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Transaction not found</AlertTitle>
          <AlertDescription>{(error as Error)?.message ?? "Unknown error"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isDeposit = tx.direction === "deposit";
  const amountStr = formatMinor(tx.amount_minor, tx.currency);
  const status = tx.reverses_tx_id ? "reversal" : tx.status;
  const isPending = tx.status === "pending";
  const isPosted = tx.status === "posted";
  const isFailed = tx.status === "rejected";
  const creator = tx.created_by_user_id ? profileMap?.get(tx.created_by_user_id) : null;
  const approver = tx.approved_by_user_id ? profileMap?.get(tx.approved_by_user_id) : null;

  return (
    <div className="p-4 sm:p-6 space-y-6 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/app/transactions"
          className="inline-flex items-center gap-1.5 text-text-secondary hover:text-gold transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Transactions
        </Link>
        <span className="text-text-tertiary">/</span>
        <span className="font-mono text-foreground">{tx.tx_number}</span>
      </div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <PremiumCard variant="premium" className="p-6 relative">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,oklch(from_var(--gold)_l_c_h/0.12),transparent_60%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-mono font-semibold text-foreground">
                  {tx.tx_number}
                </h1>
                <StatusBadge status={status} />
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-surface-2 text-text-secondary capitalize">
                  {tx.direction} · {tx.channel}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(tx.tx_number);
                    toast.success("Copied");
                  }}
                  className="text-text-secondary hover:text-gold transition-colors"
                  title="Copy ID"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-end gap-3">
                <span
                  className={cn(
                    "text-4xl font-playfair font-bold tabular-nums",
                    isDeposit ? "text-[var(--success)]" : "text-foreground",
                  )}
                >
                  {isDeposit ? "+" : "−"}
                  {amountStr}
                </span>
                <CurrencyBadge currency={tx.currency} className="mb-1.5" />
              </div>
              <div className="text-sm text-text-secondary">
                {formatDateTime(tx.posted_at ?? tx.created_at)}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {isAuditor ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                  <Eye className="h-3 w-3" /> Read only
                </span>
              ) : null}

              {isPending && isAdmin ? (
                <>
                  <Button
                    variant="outline"
                    className="border-red-900/40 text-red-400 hover:bg-red-900/20"
                    onClick={() => {
                      const reason = prompt("Reject reason?");
                      if (reason && reason.trim().length >= 3) reject.mutate(reason.trim());
                    }}
                    disabled={reject.isPending}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" /> Reject
                  </Button>
                  <Button
                    variant="gold"
                    onClick={() => approve.mutate()}
                    disabled={approve.isPending}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    {approve.isPending ? "Approving…" : "Approve"}
                  </Button>
                </>
              ) : null}

              {isPosted ? (
                <Button variant="outline" disabled>
                  <Download className="mr-1.5 h-4 w-4" /> Receipt
                </Button>
              ) : null}

              {isFailed && isAdmin ? (
                <Button variant="gold">
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Retry
                </Button>
              ) : null}
            </div>
          </div>
        </PremiumCard>
      </motion.div>

      {tx.reject_reason ? (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Rejected</AlertTitle>
          <AlertDescription>{tx.reject_reason}</AlertDescription>
        </Alert>
      ) : null}
      {tx.correction_reason ? (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Correction reason</AlertTitle>
          <AlertDescription>{tx.correction_reason}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-1">
          {/* Status timeline */}
          <PremiumCard className="p-6">
            <div className="text-[10px] uppercase tracking-[0.15em] text-text-secondary mb-4">
              Status timeline
            </div>
            <Timeline tx={tx} creator={creator} approver={approver} />
          </PremiumCard>

          {/* Audit trail */}
          <PremiumCard className="p-6">
            <div className="text-[10px] uppercase tracking-[0.15em] text-text-secondary mb-4">
              Audit trail
            </div>
            <div className="relative pl-5 border-l border-border space-y-4">
              {/* Initiation entry — always shown */}
              <div className="relative">
                <span className="absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full bg-gold/70 border border-gold" />
                <div className="text-sm font-medium text-foreground">Initiated</div>
                <div className="text-xs text-text-secondary mt-0.5">
                  by{" "}
                  <span className="text-gold-soft">
                    {creator || "Unknown teller"}
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-tertiary mt-1">
                  {formatDateTime(tx.created_at)}
                </div>
              </div>

              {(!audit || audit.length === 0) ? (
                <div className="text-xs text-text-secondary">No further audit events.</div>
              ) : (
                audit.map((ev) => (
                  <div key={ev.id} className="relative">
                    <span className="absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full bg-surface-2 border border-border" />
                    <div className="text-sm font-medium text-foreground capitalize">
                      {String(ev.action).replace(/_/g, " ")}
                    </div>
                    {ev.details ? (
                      <div className="text-xs text-text-secondary mt-0.5 truncate">
                        {typeof ev.details === "string"
                          ? ev.details
                          : JSON.stringify(ev.details)}
                      </div>
                    ) : null}
                    <div className="text-[10px] uppercase tracking-wider text-text-tertiary mt-1">
                      {formatDateTime(ev.created_at)}
                      {ev.actor_name ? (
                        <>
                          {" "}
                          • by <span className="text-gold-soft">{ev.actor_name}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </PremiumCard>
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-2">
          {/* From / To */}
          <PremiumCard className="p-6">
            <div className="text-[10px] uppercase tracking-[0.15em] text-text-secondary mb-4">
              {isDeposit ? "Deposit details" : "Withdrawal details"}
            </div>
            <div className="grid md:grid-cols-[1fr_auto_1fr] items-center gap-4">
              <FromToTile
                title={isDeposit ? "From" : "From"}
                primary={
                  isDeposit
                    ? tx.vault?.name ?? `${tx.channel} vault`
                    : tx.customer?.name ?? "Customer"
                }
                secondary={
                  isDeposit
                    ? `${tx.vault?.vault_channel ?? tx.channel} vault`
                    : tx.customer?.account_number
                      ? `#${tx.customer.account_number}`
                      : ""
                }
                icon={
                  isDeposit ? (
                    tx.channel === "cash" ? (
                      <Wallet className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )
                  ) : (
                    <UserIcon className="h-4 w-4" />
                  )
                }
              />
              <div className="flex justify-center">
                <div className="w-10 h-10 rounded-full bg-surface-2 border border-border grid place-items-center shadow-[0_0_15px_oklch(from_var(--gold)_l_c_h/0.10)] rotate-90 md:rotate-0">
                  <ArrowRight className="h-4 w-4 text-gold" />
                </div>
              </div>
              <FromToTile
                title="To"
                primary={
                  isDeposit
                    ? tx.customer?.name ?? "Customer"
                    : tx.vault?.name ?? `${tx.channel} vault`
                }
                secondary={
                  isDeposit
                    ? tx.customer?.account_number
                      ? `#${tx.customer.account_number}`
                      : ""
                    : `${tx.vault?.vault_channel ?? tx.channel} vault`
                }
                icon={
                  isDeposit ? (
                    <UserIcon className="h-4 w-4" />
                  ) : tx.channel === "cash" ? (
                    <Wallet className="h-4 w-4" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )
                }
              />
            </div>
          </PremiumCard>

          {/* Amount details */}
          <PremiumCard className="p-6">
            <div className="text-[10px] uppercase tracking-[0.15em] text-text-secondary mb-4">
              Amount details
            </div>
            <div className="space-y-0">
              <DetailLine label="Transaction amount" value={`${amountStr} ${tx.currency}`} />
              <DetailLine label="Fee" value="—" />
              <DetailLine
                label={isDeposit ? "Total credited" : "Total debited"}
                value={`${amountStr} ${tx.currency}`}
                emphasized
              />
            </div>
          </PremiumCard>

          {/* Compliance + Reference */}
          <div className="grid md:grid-cols-2 gap-6">
            <PremiumCard className="p-6">
              <div className="text-[10px] uppercase tracking-[0.15em] text-text-secondary mb-4">
                Compliance &amp; documentation
              </div>
              <div className="text-xs text-text-secondary mb-2 uppercase tracking-wider">
                Supporting documents
              </div>
              {!attachments || attachments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-text-secondary">
                  No files attached.
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map((a) => (
                    <AttachmentRow key={a.id} att={a} />
                  ))}
                </div>
              )}
            </PremiumCard>

            <PremiumCard className="p-6">
              <div className="text-[10px] uppercase tracking-[0.15em] text-text-secondary mb-4">
                Reference information
              </div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">
                Description
              </div>
              <div className="rounded-lg bg-surface-2 border border-border p-3 text-sm text-foreground">
                {tx.comment || "—"}
              </div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mt-4 mb-2">
                Initiated by
              </div>
              <div className="text-sm text-foreground">
                {creator || "—"}
                {approver ? (
                  <span className="text-text-secondary">
                    {" "}
                    · approved by {approver}
                  </span>
                ) : null}
              </div>
            </PremiumCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function FromToTile({
  title,
  primary,
  secondary,
  icon,
}: {
  title: string;
  primary: string;
  secondary?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface-2/40 p-5 group">
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-[oklch(from_var(--gold)_l_c_h/0.05)] rounded-full blur-2xl group-hover:bg-[oklch(from_var(--gold)_l_c_h/0.10)] transition-colors pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-text-secondary mb-2">
          {icon} {title}
        </div>
        <div className="text-lg font-medium text-foreground">{primary}</div>
        {secondary ? (
          <div className="text-xs font-mono text-text-secondary mt-0.5">{secondary}</div>
        ) : null}
      </div>
    </div>
  );
}

function DetailLine({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
      <span className="text-xs uppercase tracking-wider text-text-secondary">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          emphasized
            ? "text-lg font-semibold text-gold"
            : "text-sm text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Timeline({
  tx,
  creator,
  approver,
}: {
  tx: TxFull;
  creator?: string | null;
  approver?: string | null;
}) {
  const isPosted = tx.status === "posted";
  const isPending = tx.status === "pending";
  const isRejected = tx.status === "rejected";

  const steps = [
    { key: "init", label: "Initiated", state: "completed" as const, time: tx.created_at, by: creator },
    {
      key: "review",
      label: isPending ? "Pending approval" : "Reviewed",
      state: (isPending ? "active" : "completed") as "active" | "completed",
      time: isPending ? null : tx.posted_at ?? tx.created_at,
      by: approver,
    },
    {
      key: "decision",
      label: isRejected ? "Rejected" : isPosted ? "Approved" : "Awaiting decision",
      state: (isRejected
        ? "failed"
        : isPosted
          ? "completed"
          : "future") as "completed" | "failed" | "future",
      time: tx.posted_at,
      by: approver,
    },
    {
      key: "done",
      label: isPosted ? "Posted" : isRejected ? "Closed" : "—",
      state: (isPosted ? "completed" : isRejected ? "failed" : "future") as
        | "completed"
        | "failed"
        | "future",
      time: tx.posted_at,
      by: null,
    },
  ];

  return (
    <ol className="space-y-5 relative">
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-3">
          <div className="relative">
            <div
              className={cn(
                "w-9 h-9 rounded-full grid place-items-center border-4 border-card relative",
                s.state === "completed" &&
                  "bg-[oklch(from_var(--success)_l_c_h/0.20)] border-[oklch(from_var(--success)_l_c_h/0.50)]",
                s.state === "active" &&
                  "bg-[oklch(from_var(--gold)_l_c_h/0.20)] border-[oklch(from_var(--gold)_l_c_h/0.50)]",
                s.state === "failed" &&
                  "bg-[oklch(from_var(--destructive)_l_c_h/0.20)] border-[oklch(from_var(--destructive)_l_c_h/0.50)]",
                s.state === "future" && "bg-surface-2 border-border",
              )}
            >
              {s.state === "active" && (
                <span className="absolute inset-0 rounded-full bg-[oklch(from_var(--gold)_l_c_h/0.40)] animate-ping" />
              )}
              {s.state === "completed" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)] relative" />
              ) : s.state === "failed" ? (
                <XCircle className="h-3.5 w-3.5 text-[var(--destructive)] relative" />
              ) : s.state === "active" ? (
                <Clock className="h-3.5 w-3.5 text-gold relative" />
              ) : (
                <Hash className="h-3.5 w-3.5 text-text-tertiary relative" />
              )}
            </div>
            {i < steps.length - 1 ? (
              <div className="absolute left-1/2 top-9 -translate-x-1/2 w-px h-5 bg-border" />
            ) : null}
          </div>
          <div className="pt-1.5">
            <div
              className={cn(
                "text-sm font-medium",
                s.state === "active" ? "text-gold" : "text-foreground",
              )}
            >
              {s.label}
            </div>
            {s.time ? (
              <div className="text-xs text-text-secondary mt-0.5">
                {formatDateTime(s.time)}
              </div>
            ) : null}
            {s.by ? (
              <div className="text-[10px] uppercase tracking-wider text-text-tertiary mt-0.5">
                by {s.by}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function AttachmentRow({ att }: { att: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function go() {
      const { data } = await supabase.storage
        .from("tx-attachments")
        .createSignedUrl(att.storage_path, 60);
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    }
    go();
    return () => {
      cancelled = true;
    };
  }, [att.storage_path]);

  const isImage = (att.content_type ?? "").startsWith("image/");
  const isPdf = att.content_type === "application/pdf";
  const Icon = isImage ? ImageIcon : isPdf ? FileText : FileIcon;

  return (
    <div className="flex items-center gap-3 p-3 bg-surface-2 rounded-lg border border-border hover:border-[oklch(from_var(--gold)_l_c_h/0.30)] transition-colors">
      <div className="w-9 h-9 rounded-lg bg-surface border border-border grid place-items-center">
        <Icon className="h-4 w-4 text-text-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{att.file_name}</div>
        <div className="text-[10px] text-text-secondary">
          {att.content_type ?? "file"}
        </div>
      </div>
      {url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-text-secondary hover:text-gold p-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href={url}
            download={att.file_name}
            className="text-text-secondary hover:text-gold p-1.5"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </>
      ) : null}
    </div>
  );
}
