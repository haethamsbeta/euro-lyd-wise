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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMinor, formatDateTime, parseAmountToMinor } from "@/lib/format";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Paperclip,
  Pencil,
  Search,
  ShieldAlert,
  File as FileIcon,
  User as UserIcon,
  Clock,
  CheckCircle2,
  XCircle,
  Hash,
  Wallet,
  Building2,
} from "lucide-react";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  customer_name: string | null;
  customer_account_number: string | null;
  attachment_count: number;
};

type StatusFilter = "all" | "posted" | "pending" | "rejected" | "reversed";
type DirectionFilter = "all" | "deposit" | "withdraw";

function TxList() {
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [filesOnly, setFilesOnly] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [reviewing, setReviewing] = useState<Tx | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["transactions.list.v2", q],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(
          `id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, customer_account_id, reverses_tx_id, corrected_by_tx_id,
           customer:accounts!transactions_customer_account_id_fkey(name, account_number),
           transaction_attachments(count)`,
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (q.trim()) query = query.ilike("tx_number", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return rows.map<Tx>((r) => ({
        id: r.id,
        tx_number: r.tx_number,
        direction: r.direction,
        channel: r.channel,
        currency: r.currency,
        amount_minor: r.amount_minor,
        status: r.status,
        comment: r.comment,
        created_at: r.created_at,
        customer_account_id: r.customer_account_id,
        reverses_tx_id: r.reverses_tx_id,
        corrected_by_tx_id: r.corrected_by_tx_id,
        customer_name: r.customer?.name ?? null,
        customer_account_number: r.customer?.account_number ?? null,
        attachment_count: Array.isArray(r.transaction_attachments)
          ? Number(r.transaction_attachments[0]?.count ?? 0)
          : 0,
      }));
    },
  });

  // tx_number → tx for chain references
  const byNumber = useMemo(() => {
    const m = new Map<string, Tx>();
    (data ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (statusFilter !== "all") rows = rows.filter((t) => t.status === statusFilter);
    if (directionFilter !== "all") rows = rows.filter((t) => t.direction === directionFilter);
    if (filesOnly) rows = rows.filter((t) => t.attachment_count > 0);
    return rows;
  }, [data, statusFilter, directionFilter, filesOnly]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const colCount = isAdmin ? 10 : 9;

  return (
    <TooltipProvider delayDuration={150}>
      <div>
        <PageHeader
          title="Transactions"
          description="All posted, pending, rejected, and reversed entries — grouped by day for quick review."
        />
        <div className="space-y-4 p-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-xs flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by TX number…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <Segmented
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { value: "all", label: "All" },
                { value: "pending", label: "Pending" },
                { value: "posted", label: "Posted" },
                { value: "rejected", label: "Rejected" },
                { value: "reversed", label: "Reversed" },
              ]}
            />

            <Segmented
              value={directionFilter}
              onChange={(v) => setDirectionFilter(v as DirectionFilter)}
              options={[
                { value: "all", label: "All" },
                { value: "deposit", label: "Deposits" },
                { value: "withdraw", label: "Withdrawals" },
              ]}
            />

            <label className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm">
              <Switch checked={filesOnly} onCheckedChange={setFilesOnly} />
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" /> Has files
              </span>
            </label>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="w-1 px-0 py-2"></th>
                      <th className="px-3 py-2 text-left">TX #</th>
                      <th className="px-3 py-2 text-left">Time</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-left">Direction</th>
                      <th className="px-3 py-2 text-left">Channel</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-center">Files</th>
                      <th className="px-3 py-2 text-left">Comment</th>
                      {isAdmin ? <th className="px-3 py-2 text-right">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {isLoading ? (
                      <SkeletonRows cols={colCount} />
                    ) : error ? (
                      <tr>
                        <td colSpan={colCount} className="p-6 text-center text-destructive">
                          Failed to load transactions: {(error as Error).message}
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={colCount} className="p-6 text-center text-muted-foreground">
                          No transactions match the current filters.
                        </td>
                      </tr>
                    ) : (
                      grouped.map(({ label, items }) => (
                        <DayGroup
                          key={label}
                          label={label}
                          items={items}
                          colCount={colCount}
                          isAdmin={isAdmin}
                          byId={byNumber}
                          onEdit={setEditing}
                          onReview={setReviewing}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <CorrectionDialog tx={editing} onClose={() => setEditing(null)} />
        <AttachmentsSheet tx={reviewing} onClose={() => setReviewing(null)} />
      </div>
    </TooltipProvider>
  );
}

/* ---------------- helpers + sub-components ---------------- */

function groupByDay(rows: Tx[]) {
  const out: { label: string; items: Tx[] }[] = [];
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  for (const r of rows) {
    const d = new Date(r.created_at);
    let label: string;
    if (sameDay(d, today)) label = "Today";
    else if (sameDay(d, yest)) label = "Yesterday";
    else
      label = d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(r);
    else out.push({ label, items: [r] });
  }
  return out;
}

function DayGroup({
  label,
  items,
  colCount,
  isAdmin,
  byId,
  onEdit,
  onReview,
}: {
  label: string;
  items: Tx[];
  colCount: number;
  isAdmin: boolean;
  byId: Map<string, Tx>;
  onEdit: (tx: Tx) => void;
  onReview: (tx: Tx) => void;
}) {
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={colCount} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} <span className="ml-2 font-normal normal-case text-muted-foreground/70">({items.length})</span>
        </td>
      </tr>
      {items.map((tx) => (
        <TxRow
          key={tx.id}
          tx={tx}
          isAdmin={isAdmin}
          byId={byId}
          onEdit={onEdit}
          onReview={onReview}
        />
      ))}
    </>
  );
}

function TxRow({
  tx,
  isAdmin,
  byId,
  onEdit,
  onReview,
}: {
  tx: Tx;
  isAdmin: boolean;
  byId: Map<string, Tx>;
  onEdit: (tx: Tx) => void;
  onReview: (tx: Tx) => void;
}) {
  const canEdit =
    isAdmin && tx.status === "posted" && !tx.reverses_tx_id && !tx.corrected_by_tx_id;

  const reverses = tx.reverses_tx_id ? byId.get(tx.reverses_tx_id) : null;
  const correctedBy = tx.corrected_by_tx_id ? byId.get(tx.corrected_by_tx_id) : null;

  const isDeposit = tx.direction === "deposit";
  const time = new Date(tx.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const accent = statusAccent(tx);

  return (
    <tr className="group transition-colors hover:bg-muted/40">
      <td className={cn("w-1 p-0", accent.bar)} aria-hidden />
      <td className="px-3 py-2.5 align-top">
        <div className="font-mono text-[13px] font-medium">{tx.tx_number}</div>
        {reverses ? (
          <div className="mt-0.5 text-[11px] text-warning">
            ↩ reverses <span className="font-mono">{reverses.tx_number}</span>
          </div>
        ) : null}
        {correctedBy ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            → corrected by <span className="font-mono">{correctedBy.tx_number}</span>
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2.5 align-top text-muted-foreground">
        <div>{time}</div>
        <div className="text-[11px] text-muted-foreground/70">
          {formatDateTime(tx.created_at).split(",")[0]}
        </div>
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="font-medium">{tx.customer_name ?? "—"}</div>
        {tx.customer_account_number ? (
          <div className="text-[11px] text-muted-foreground">#{tx.customer_account_number}</div>
        ) : null}
      </td>
      <td className="px-3 py-2.5 align-top">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            isDeposit
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {isDeposit ? (
            <ArrowDownCircle className="h-3 w-3" />
          ) : (
            <ArrowUpCircle className="h-3 w-3" />
          )}
          {isDeposit ? "Deposit" : "Withdraw"}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top capitalize text-muted-foreground">{tx.channel}</td>
      <td className="px-3 py-2.5 align-top text-right font-mono tabular-nums">
        <span className="text-base font-semibold">{formatMinor(tx.amount_minor, tx.currency)}</span>{" "}
        <span className="text-[11px] text-muted-foreground">{tx.currency}</span>
      </td>
      <td className="px-3 py-2.5 align-top">
        <StatusBadge tx={tx} />
      </td>
      <td className="px-3 py-2.5 text-center align-top">
        {tx.attachment_count > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onReview(tx)}
                className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs text-foreground hover:bg-accent"
              >
                <Paperclip className="h-3 w-3" />
                {tx.attachment_count}
              </button>
            </TooltipTrigger>
            <TooltipContent>Review attached files</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </td>
      <td className="max-w-[260px] px-3 py-2.5 align-top">
        {tx.comment ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate text-muted-foreground">{tx.comment}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{tx.comment}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </td>
      {isAdmin ? (
        <td className="px-3 py-2.5 text-right align-top">
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => onEdit(tx)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      ) : null}
    </tr>
  );
}

function statusAccent(tx: Tx): { bar: string } {
  if (tx.status === "pending") return { bar: "bg-warning" };
  if (tx.status === "rejected") return { bar: "bg-destructive" };
  if (tx.status === "reversed") return { bar: "bg-warning/60" };
  if (tx.reverses_tx_id) return { bar: "bg-warning/60" };
  return { bar: "bg-success/70" };
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

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-sm px-2.5 py-1 transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          <td className="w-1 p-0" />
          <td colSpan={cols - 1} className="px-3 py-3">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </td>
        </tr>
      ))}
    </>
  );
}

/* ---------------- Attachments side sheet ---------------- */

type Attachment = {
  id: string;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

function AttachmentsSheet({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const open = !!tx;
  const { data, isLoading, error } = useQuery({
    queryKey: ["tx.attachments", tx?.id],
    enabled: open,
    queryFn: async (): Promise<Attachment[]> => {
      const { data, error } = await supabase
        .from("transaction_attachments")
        .select("id, file_name, storage_path, content_type, size_bytes, created_at")
        .eq("transaction_id", tx!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Attachments
          </SheetTitle>
          <SheetDescription>
            {tx ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-foreground">{tx.tx_number}</span>
                <span>·</span>
                <span>{tx.customer_name ?? "—"}</span>
                <span>·</span>
                <span className="font-mono">{formatMinor(tx.amount_minor, tx.currency)} {tx.currency}</span>
                <span>·</span>
                <StatusBadge tx={tx} />
              </span>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load attachments</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          ) : !data || data.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No files attached to this transaction.
            </div>
          ) : (
            data.map((att) => <AttachmentCard key={att.id} att={att} />)
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AttachmentCard({ att }: { att: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const isImage = (att.content_type ?? "").startsWith("image/");
  const isPdf = att.content_type === "application/pdf";

  useEffect(() => {
    let cancelled = false;
    async function go() {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase.storage
        .from("tx-attachments")
        .createSignedUrl(att.storage_path, 60);
      if (cancelled) return;
      if (error || !data) {
        setErr(error?.message ?? "Could not generate preview link");
      } else {
        setUrl(data.signedUrl);
      }
      setLoading(false);
    }
    go();
    return () => {
      cancelled = true;
    };
  }, [att.storage_path]);

  async function refreshAndOpen(target: "tab" | "download") {
    const { data, error } = await supabase.storage
      .from("tx-attachments")
      .createSignedUrl(att.storage_path, 60, target === "download" ? { download: att.file_name } : undefined);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to generate link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const Icon = isImage ? ImageIcon : isPdf ? FileText : FileIcon;

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{att.file_name}</div>
            <div className="text-[11px] text-muted-foreground">
              {formatBytes(att.size_bytes)} · {att.content_type ?? "unknown"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={() => refreshAndOpen("tab")}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refreshAndOpen("download")}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="bg-muted/20">
        {loading ? (
          <div className="h-64 animate-pulse bg-muted" />
        ) : err ? (
          <div className="p-4 text-sm text-destructive">{err}</div>
        ) : isImage && url ? (
          <img
            src={url}
            alt={att.file_name}
            className="max-h-[480px] w-full object-contain"
          />
        ) : isPdf && url ? (
          <iframe
            src={url}
            title={att.file_name}
            className="h-[600px] w-full"
          />
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Preview not available for this file type. Use the buttons above to open or download.
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number | null) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ---------------- Correction dialog (unchanged behavior) ---------------- */

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
