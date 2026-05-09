import { createFileRoute, Link } from "@tanstack/react-router";
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
  Calendar as CalendarIcon,
  X,
  Plus,
  TrendingUp,
  Eye,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ExportPdfButton } from "@/components/app/export-pdf";
import { describeTx } from "@/lib/tx-describe";
import { useDebounced } from "@/hooks/use-debounced";

export const Route = createFileRoute("/app/transactions/")({
  component: TxList,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
    focus: typeof search.focus === "string" ? search.focus : undefined,
  }),
});

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
  customer_dahab_number: string | null;
  attachment_count: number;
};

type StatusFilter = "all" | "posted" | "pending" | "rejected" | "reversed";
type DirectionFilter = "all" | "deposit" | "withdraw";
type DatePreset = "all" | "today" | "week" | "month" | "custom";

function presetRange(p: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (p === "today") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (p === "week") {
    const from = new Date(now); from.setDate(now.getDate() - 7);
    return { from, to: now };
  }
  if (p === "month") {
    const from = new Date(now); from.setMonth(now.getMonth() - 1);
    return { from, to: now };
  }
  return { from: null, to: null };
}

function TxList() {
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  const debouncedQ = useDebounced(q, 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [filesOnly, setFilesOnly] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [details, setDetails] = useState<Tx | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);

  // Sync incoming search params (e.g. from global search) into local state.
  useEffect(() => {
    if (search.q !== undefined) setQ(search.q);
  }, [search.q]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["transactions.list.v2", debouncedQ],
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
      // Server-side narrow on tx_number; broader fields filtered client-side below.
      // Avoid filtering on server when the term might match a name/amount.
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
        customer_dahab_number: null,
        attachment_count: Array.isArray(r.transaction_attachments)
          ? Number(r.transaction_attachments[0]?.count ?? 0)
          : 0,
      }));
    },
  });


  const { data: dahabMap } = useQuery({
    queryKey: ["transactions.dahabmap"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holder_accounts")
        .select("account_number,dahab_account_number");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of data ?? []) {
        if (r.account_number && r.dahab_account_number) m.set(r.account_number, r.dahab_account_number);
      }
      return m;
    },
  });
  // tx_number → tx for chain references
  const byNumber = useMemo(() => {
    const m = new Map<string, Tx>();
    (data ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [data]);

  // Auto-open the details sheet when navigated with ?focus=<txId>
  useEffect(() => {
    if (!search.focus || !data) return;
    const tx = data.find((t) => t.id === search.focus);
    if (tx) setDetails(tx);
  }, [search.focus, data]);

  const filtered = useMemo(() => {
    let rows = (data ?? []).map((t) => ({
      ...t,
      customer_dahab_number: t.customer_account_number ? (dahabMap?.get(t.customer_account_number) ?? null) : null,
    }));
    if (statusFilter !== "all") rows = rows.filter((t) => t.status === statusFilter);
    if (directionFilter !== "all") rows = rows.filter((t) => t.direction === directionFilter);
    if (filesOnly) rows = rows.filter((t) => t.attachment_count > 0);
    const term = debouncedQ.trim().toLowerCase();
    if (term) {
      rows = rows.filter((t) => {
        const amountStr = formatMinor(t.amount_minor, t.currency).toLowerCase();
        return (
          t.tx_number.toLowerCase().includes(term) ||
          (t.customer_name ?? "").toLowerCase().includes(term) ||
          (t.customer_account_number ?? "").toLowerCase().includes(term) ||
          (t.customer_dahab_number ?? "").toLowerCase().includes(term) ||
          (t.comment ?? "").toLowerCase().includes(term) ||
          amountStr.includes(term) ||
          t.currency.toLowerCase().includes(term)
        );
      });
    }
    let from: Date | null = null;
    let to: Date | null = null;
    if (datePreset === "custom") {
      from = customFrom ?? null;
      to = customTo ?? null;
      if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); to = t; }
    } else if (datePreset !== "all") {
      const r = presetRange(datePreset);
      from = r.from; to = r.to;
    }
    if (from || to) {
      rows = rows.filter((t) => {
        const d = new Date(t.created_at).getTime();
        if (from && d < from.getTime()) return false;
        if (to && d > to.getTime()) return false;
        return true;
      });
    }
    return rows;
  }, [data, dahabMap, statusFilter, directionFilter, filesOnly, debouncedQ, datePreset, customFrom, customTo]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const colCount = isAdmin ? 10 : 9;

  // KPIs derived from the loaded set (last 200 txns)
  const kpis = useMemo(() => {
    const rows = data ?? [];
    const today = new Date();
    const isToday = (d: string) => {
      const x = new Date(d);
      return (
        x.getFullYear() === today.getFullYear() &&
        x.getMonth() === today.getMonth() &&
        x.getDate() === today.getDate()
      );
    };
    return {
      today: rows.filter((r) => isToday(r.created_at)).length,
      pending: rows.filter((r) => r.status === "pending").length,
      posted: rows.filter((r) => r.status === "posted").length,
      rejected: rows.filter((r) => r.status === "rejected" || r.status === "reversed").length,
    };
  }, [data]);

  return (
    <TooltipProvider delayDuration={150}>
      <div>
        <PageHeader
          title="Transactions"
          description="All posted, pending, rejected, and reversed entries — grouped by day for quick review."
          actions={
            <div className="flex items-center gap-2">
              {!isAdmin ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-500">
                  <Eye className="h-3 w-3" /> Read only
                </span>
              ) : null}
              <Link to="/app/transactions/new">
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" /> New transaction
                </Button>
              </Link>
            </div>
          }
        />
        <div className="space-y-4 p-4 sm:p-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile
              label="Txns today"
              value={kpis.today}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              tone="primary"
              onClick={() => setDatePreset("today")}
            />
            <KpiTile
              label="Pending"
              value={kpis.pending}
              tone="warning"
              onClick={() => setStatusFilter("pending")}
            />
            <KpiTile
              label="Posted"
              value={kpis.posted}
              tone="success"
              onClick={() => setStatusFilter("posted")}
            />
            <KpiTile
              label="Rejected / reversed"
              value={kpis.rejected}
              tone="destructive"
              onClick={() => setStatusFilter("rejected")}
            />
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-xs flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search TX #, DAHAB #, customer, amount…"
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

            <Segmented
              value={datePreset === "custom" ? "all" : datePreset}
              onChange={(v) => setDatePreset(v as DatePreset)}
              options={[
                { value: "all", label: "Any time" },
                { value: "today", label: "Today" },
                { value: "week", label: "7d" },
                { value: "month", label: "30d" },
              ]}
            />

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={datePreset === "custom" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {datePreset === "custom" && (customFrom || customTo)
                    ? `${customFrom ? customFrom.toLocaleDateString() : "…"} – ${customTo ? customTo.toLocaleDateString() : "…"}`
                    : "Custom range"}
                  {datePreset === "custom" ? (
                    <X
                      className="ml-1.5 h-3.5 w-3.5 opacity-70 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDatePreset("all");
                        setCustomFrom(undefined);
                        setCustomTo(undefined);
                      }}
                    />
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <div className="flex flex-col gap-3 w-64">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input
                      type="date"
                      value={customFrom ? customFrom.toISOString().slice(0, 10) : ""}
                      onChange={(e) => {
                        setCustomFrom(e.target.value ? new Date(e.target.value) : undefined);
                        setDatePreset("custom");
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      type="date"
                      value={customTo ? customTo.toISOString().slice(0, 10) : ""}
                      onChange={(e) => {
                        setCustomTo(e.target.value ? new Date(e.target.value) : undefined);
                        setDatePreset("custom");
                      }}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <label className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm">
              <Switch checked={filesOnly} onCheckedChange={setFilesOnly} />
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" /> Has files
              </span>
            </label>

            <div className="ml-auto">
              <ExportPdfButton
                title="Transactions"
                filenamePrefix="transactions"
                columns={[
                  { header: "TX #", width: 70 },
                  { header: "Date & Time", width: 105 },
                  { header: "Customer", width: 120 },
                  { header: "Direction", width: 60 },
                  { header: "Channel", width: 50 },
                  { header: "Amount", width: 80 },
                  { header: "Status", width: 60 },
                  { header: "Files", width: 35 },
                  { header: "Description" },
                ]}
                buildRows={async (from, to) => {
                  const { data, error } = await supabase
                    .from("transactions")
                    .select(
                      `id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, reverses_tx_id, corrected_by_tx_id,
                       customer:accounts!transactions_customer_account_id_fkey(name, account_number),
                       transaction_attachments(count)`,
                    )
                    .gte("created_at", from.toISOString())
                    .lte("created_at", to.toISOString())
                    .order("created_at", { ascending: false })
                    .limit(5000);
                  if (error) throw error;
                  return ((data ?? []) as any[]).map((r) => {
                    const dir = r.direction === "deposit" ? "Deposit" : "Withdraw";
                    const customer = r.customer?.name
                      ? `${r.customer.name}${r.customer.account_number ? ` (#${r.customer.account_number})` : ""}`
                      : "—";
                    const attCount = Array.isArray(r.transaction_attachments)
                      ? Number(r.transaction_attachments[0]?.count ?? 0)
                      : 0;
                    const sentence = describeTx({
                      direction: r.direction,
                      status: r.status,
                      channel: r.channel,
                      amount: formatMinor(r.amount_minor, r.currency),
                      customerName: r.customer?.name ?? null,
                      comment: r.comment,
                      isReversal: !!r.reverses_tx_id,
                      isCorrected: !!r.corrected_by_tx_id,
                    });
                    return [
                      r.tx_number,
                      formatDateTime(r.created_at),
                      customer,
                      dir,
                      String(r.channel),
                      `${formatMinor(r.amount_minor, r.currency)} ${r.currency}`,
                      String(r.status),
                      attCount > 0 ? String(attCount) : "—",
                      sentence,
                    ];
                  });
                }}
              />
            </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
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
                          onOpen={setDetails}
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
        <TxDetailsSheet tx={details} onClose={() => setDetails(null)} />
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
  onOpen,
}: {
  label: string;
  items: Tx[];
  colCount: number;
  isAdmin: boolean;
  byId: Map<string, Tx>;
  onEdit: (tx: Tx) => void;
  onOpen: (tx: Tx) => void;
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
          onOpen={onOpen}
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
  onOpen,
}: {
  tx: Tx;
  isAdmin: boolean;
  byId: Map<string, Tx>;
  onEdit: (tx: Tx) => void;
  onOpen: (tx: Tx) => void;
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

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <tr
      className="group cursor-pointer transition-colors hover:bg-muted/40"
      onClick={() => onOpen(tx)}
    >
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
            "chip",
            isDeposit
              ? "!border-success/40 !text-success"
              : "!border-destructive/40 !text-destructive",
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
      <td className="px-3 py-2.5 align-top text-right num">
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
                onClick={(e) => { stop(e); onOpen(tx); }}
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
        <td className="px-3 py-2.5 text-right align-top" onClick={stop}>
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

function KpiTile({
  label,
  value,
  icon,
  tone = "primary",
  onClick,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  tone?: "primary" | "warning" | "success" | "destructive";
  onClick?: () => void;
}) {
  const toneCls =
    tone === "warning"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : tone === "destructive"
          ? "text-destructive"
          : "text-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        {icon ? <span className={cn("opacity-70", toneCls)}>{icon}</span> : null}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums", toneCls)}>{value}</div>
    </button>
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

/* ---------------- Details side sheet ---------------- */

type Attachment = {
  id: string;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  uploaded_by: string;
};

type TxDetails = {
  tx_number: string;
  posted_at: string | null;
  reject_reason: string | null;
  correction_reason: string | null;
  approved_by_user_id: string | null;
  created_by_user_id: string;
  vault: { name: string; vault_channel: string | null } | null;
  ledger: { id: string; account_id: string; side: string; amount_minor: number; currency: string }[];
  attachments: Attachment[];
  creator_name: string | null;
  approver_name: string | null;
};

function TxDetailsSheet({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const open = !!tx;
  const { data, isLoading, error } = useQuery({
    queryKey: ["tx.details", tx?.id],
    enabled: open,
    queryFn: async (): Promise<TxDetails> => {
      // Core transaction (with vault embed) + ledger + attachments in parallel
      const [txRes, ledgerRes, attRes] = await Promise.all([
        supabase
          .from("transactions")
          .select(
            `tx_number, posted_at, reject_reason, correction_reason,
             approved_by_user_id, created_by_user_id,
             vault:accounts!transactions_vault_account_id_fkey(name, vault_channel)`,
          )
          .eq("id", tx!.id)
          .single(),
        supabase
          .from("ledger_entries")
          .select("id, account_id, side, amount_minor, currency")
          .eq("transaction_id", tx!.id),
        supabase
          .from("transaction_attachments")
          .select("id, file_name, storage_path, content_type, size_bytes, created_at, uploaded_by")
          .eq("transaction_id", tx!.id)
          .order("created_at", { ascending: true }),
      ]);
      if (txRes.error) throw txRes.error;
      if (ledgerRes.error) throw ledgerRes.error;
      if (attRes.error) throw attRes.error;

      const t = txRes.data as any;

      // Resolve user names from profiles (separate schema, can't embed via FK)
      const userIds = Array.from(
        new Set(
          [t.created_by_user_id, t.approved_by_user_id, ...(attRes.data ?? []).map((a: any) => a.uploaded_by)]
            .filter(Boolean),
        ),
      ) as string[];
      let nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name || ""));
      }

      return {
        tx_number: t.tx_number,
        posted_at: t.posted_at,
        reject_reason: t.reject_reason,
        correction_reason: t.correction_reason,
        approved_by_user_id: t.approved_by_user_id,
        created_by_user_id: t.created_by_user_id,
        vault: t.vault ?? null,
        ledger: (ledgerRes.data ?? []) as any,
        attachments: ((attRes.data ?? []) as any).map((a: any) => ({
          ...a,
          uploader_name: nameMap.get(a.uploaded_by) ?? null,
        })),
        creator_name: nameMap.get(t.created_by_user_id) ?? null,
        approver_name: t.approved_by_user_id ? nameMap.get(t.approved_by_user_id) ?? null : null,
      };
    },
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-mono text-base">
            <Hash className="h-4 w-4 text-muted-foreground" />
            {tx?.tx_number}
          </SheetTitle>
          <SheetDescription>
            {tx ? (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-foreground">{tx.customer_name ?? "—"}</span>
                {tx.customer_account_number ? (
                  <span className="text-muted-foreground">#{tx.customer_account_number}</span>
                ) : null}
                <span>·</span>
                <StatusBadge tx={tx} />
              </span>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {tx ? (
          <div className="mt-4 space-y-5">
            {/* Headline amount */}
            <div className="card-futur rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "chip",
                    tx.direction === "deposit"
                      ? "!border-success/40 !text-success"
                      : "!border-destructive/40 !text-destructive",
                  )}
                >
                  {tx.direction === "deposit" ? (
                    <ArrowDownCircle className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                  )}
                  {tx.direction === "deposit" ? "Deposit" : "Withdrawal"} · {tx.channel}
                </span>
                <div className="text-right num">
                  <div className="text-xl font-semibold">
                    {formatMinor(tx.amount_minor, tx.currency)}
                  </div>
                  <div className="text-xs text-muted-foreground">{tx.currency}</div>
                </div>
              </div>
              {tx.comment ? (
                <div className="mt-3 rounded-md bg-muted/40 p-2.5 text-sm">{tx.comment}</div>
              ) : null}
            </div>

            {/* People + timing */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailCell
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Created"
                value={formatDateTime(tx.created_at)}
              />
              <DetailCell
                icon={<UserIcon className="h-3.5 w-3.5" />}
                label="Created by (teller)"
                value={data?.creator_name || (isLoading ? "…" : "—")}
              />
              <DetailCell
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Posted"
                value={data?.posted_at ? formatDateTime(data.posted_at) : tx.status === "pending" ? "Awaiting approval" : "—"}
              />
              <DetailCell
                icon={<UserIcon className="h-3.5 w-3.5" />}
                label="Approved by (admin)"
                value={data?.approver_name || (data?.approved_by_user_id ? "—" : "Auto-posted / —")}
              />
              <DetailCell
                icon={tx.channel === "cash" ? <Wallet className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                label="Vault"
                value={data?.vault?.name ? `${data.vault.name} (${data.vault.vault_channel ?? tx.channel})` : (isLoading ? "…" : "—")}
              />
              <DetailCell
                icon={<Hash className="h-3.5 w-3.5" />}
                label="Customer #"
                value={tx.customer_account_number ?? "—"}
              />
            </div>

            {/* Reject / correction notes */}
            {data?.reject_reason ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Rejected</AlertTitle>
                <AlertDescription>{data.reject_reason}</AlertDescription>
              </Alert>
            ) : null}
            {data?.correction_reason ? (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Correction reason</AlertTitle>
                <AlertDescription>{data.correction_reason}</AlertDescription>
              </Alert>
            ) : null}

            {/* Ledger */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ledger entries
              </h3>
              {isLoading ? (
                <div className="h-16 animate-pulse rounded-md bg-muted" />
              ) : !data || data.ledger.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  No ledger entries (transaction not posted).
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Account</th>
                        <th className="px-3 py-1.5 text-left">Side</th>
                        <th className="px-3 py-1.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.ledger.map((l) => {
                        const isCustomer = l.account_id === tx.customer_account_id;
                        return (
                          <tr key={l.id}>
                            <td className="px-3 py-1.5">
                              {isCustomer
                                ? `${tx.customer_name ?? "Customer"} (#${tx.customer_account_number ?? ""})`
                                : data.vault?.name ?? "Vault"}
                            </td>
                            <td className="px-3 py-1.5 capitalize">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-xs",
                                  l.side === "debit"
                                    ? "bg-warning/15 text-warning"
                                    : "bg-success/15 text-success",
                                )}
                              >
                                {l.side}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                              {formatMinor(l.amount_minor, l.currency as any)} {l.currency}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Attachments */}
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" /> Attachments
                {data ? <span className="font-normal normal-case">({data.attachments.length})</span> : null}
              </h3>
              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-32 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : error ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load details</AlertTitle>
                  <AlertDescription>{(error as Error).message}</AlertDescription>
                </Alert>
              ) : !data || data.attachments.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No files attached to this transaction.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.attachments.map((att) => (
                    <AttachmentCard key={att.id} att={att} />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 truncate text-sm">{value}</div>
    </div>
  );
}

function AttachmentCard({ att }: { att: Attachment & { uploader_name?: string | null } }) {
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
              {att.uploader_name ? ` · uploaded by ${att.uploader_name}` : ""}
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
