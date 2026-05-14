import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isTestRow } from "@/lib/api/_shared";
import { PremiumCard } from "@/components/ui/premium-card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { StatusBadge as DesignStatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMinor, formatMinorOrMissing, formatDateTime, parseAmountToMinor } from "@/lib/format";
import {
  Paperclip,
  Search,
  ShieldAlert,
  Calendar as CalendarIcon,
  X,
  Plus,
  TrendingUp,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Pencil,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/dahabApi";
import { ExportPdfButton } from "@/components/app/export-pdf";
import { describeTx } from "@/lib/tx-describe";
import { useDebounced } from "@/hooks/use-debounced";
import { api } from "@/lib/api";
import { DATA_BACKEND, REALTIME_MODE, POLL_INTERVALS } from "@/lib/runtimeConfig";
import { useDashboardSummary, fmtTotal } from "@/lib/useDashboardSummary";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/transactions/")({
  head: () => ({ meta: [{ title: "Transactions — Dahab" }, { name: "description", content: "Search and filter every transaction posted across the Dahab ledger." }] }), component: TxList,
  validateSearch: (search: Record<string, unknown>): { q?: string; focus?: string } => {
    const out: { q?: string; focus?: string } = {};
    if (typeof search.q === "string") out.q = search.q;
    if (typeof search.focus === "string") out.focus = search.focus;
    return out;
  },
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
  vault_account_id: string | null;
  reverses_tx_id: string | null;
  corrected_by_tx_id: string | null;
  customer_name: string | null;
  customer_account_number: string | null;
  customer_dahab_number: string | null;
  attachment_count: number;
};

type StatusFilter = "all" | "posted" | "pending" | "rejected" | "reversed";
type DirectionFilter = "all" | "deposit" | "withdraw";
type ChannelFilter = "all" | "cash" | "bank";
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
  const t = useT();
  const roles = useEffectiveRoles();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const { data: dashSummary } = useDashboardSummary();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState(search.q ?? "");
  const debouncedQ = useDebounced(q, 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [filesOnly, setFilesOnly] = useState(false);
  const [overHigh, setOverHigh] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (search.q !== undefined) setQ(search.q);
  }, [search.q]);

  // If a row was opened directly via ?focus=, send to detail page.
  useEffect(() => {
    if (search.focus) {
      navigate({ to: "/app/transactions/$id", params: { id: search.focus } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.focus]);

  // Page size matches backend contract: GET /api/transactions?limit=50
  const PAGE_SIZE = 50;
  const [offset, setOffset] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["transactions.list.v2", debouncedQ, offset],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const paged = await api.transactions.listPaged({ limit: PAGE_SIZE, offset });
        const rawItems: any[] = Array.isArray(paged.items) ? paged.items : [];
        const items: Tx[] = rawItems.map((r: any) => ({
          id: String(r.id),
          tx_number: r.tx_number,
          direction: r.direction,
          channel: r.channel ?? "cash",
          currency: r.currency ?? r.currency_code,
          amount_minor: Number(r.amount_minor ?? 0),
          status: r.status,
          comment: r.comment ?? r.description ?? "",
          created_at: r.created_at ?? r.posted_at,
          customer_account_id: String(r.customer_account_id ?? ""),
          vault_account_id: r.vault_account_id ? String(r.vault_account_id) : null,
          reverses_tx_id: r.reverses_tx_id ?? null,
          corrected_by_tx_id: r.corrected_by_tx_id ?? null,
          customer_name: r.holder_name ?? r.account_display_name ?? null,
          customer_account_number: r.account_number ?? null,
          customer_dahab_number: r.dahab_account_number ?? null,
          attachment_count: 0,
        }));
        return {
          rows: items,
          total: paged.total ?? items.length,
          nextOffset: paged.next_offset ?? null,
        };
      }
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, customer_account_id, vault_account_id, reverses_tx_id, corrected_by_tx_id,
           customer:accounts!transactions_customer_account_id_fkey(name, account_number),
           transaction_attachments(count)`,
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const items = rows.map<Tx>((r) => ({
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
        vault_account_id: r.vault_account_id ?? null,
        reverses_tx_id: r.reverses_tx_id,
        corrected_by_tx_id: r.corrected_by_tx_id,
        customer_name: r.customer?.name ?? null,
        customer_account_number: r.customer?.account_number ?? null,
        customer_dahab_number: null,
        attachment_count: Array.isArray(r.transaction_attachments)
          ? Number(r.transaction_attachments[0]?.count ?? 0)
          : 0,
      }));
      return { rows: items, total: items.length, nextOffset: null };
    },
    refetchInterval:
      REALTIME_MODE === "polling" ? POLL_INTERVALS.transactions : false,
  });

  const txRows: Tx[] = (data?.rows as Tx[] | undefined) ?? [];
  const totalCount: number | null =
    typeof data?.total === "number"
      ? (data!.total as number)
      : (dashSummary?.transactionCount ?? null);
  const nextOffset: number | null = (data?.nextOffset as number | null) ?? null;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const { data: dahabMap } = useQuery({
    queryKey: ["transactions.dahabmap"],
    enabled: DATA_BACKEND !== "lambda",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holder_accounts")
        .select("account_number,dahab_account_number");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const r of data ?? []) {
        if (r.account_number && r.dahab_account_number)
          m.set(r.account_number, r.dahab_account_number);
      }
      return m;
    },
  });

  const byNumber = useMemo(() => {
    const m = new Map<string, Tx>();
    txRows.forEach((t) => m.set(t.id, t));
    return m;
  }, [txRows]);

  const filtered = useMemo(() => {
    let rows = txRows.map((t) => ({
      ...t,
      customer_dahab_number: t.customer_account_number
        ? (dahabMap?.get(t.customer_account_number) ?? null)
        : (t.customer_dahab_number ?? null),
    }));
    if (statusFilter !== "all") rows = rows.filter((t) => t.status === statusFilter);
    if (directionFilter !== "all")
      rows = rows.filter((t) => t.direction === directionFilter);
    if (channelFilter !== "all") rows = rows.filter((t) => t.channel === channelFilter);
    if (filesOnly) rows = rows.filter((t) => t.attachment_count > 0);
    if (overHigh) rows = rows.filter((t) => t.amount_minor / 100 > 25000);
    const term = debouncedQ.trim().toLowerCase();
    if (term) {
      rows = rows.filter((t) => {
        const amountStr = formatMinorOrMissing(t.amount_minor, t.currency).toLowerCase();
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
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        to = t;
      }
    } else if (datePreset !== "all") {
      const r = presetRange(datePreset);
      from = r.from;
      to = r.to;
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
  }, [
    txRows,
    dahabMap,
    statusFilter,
    directionFilter,
    channelFilter,
    filesOnly,
    overHigh,
    debouncedQ,
    datePreset,
    customFrom,
    customTo,
  ]);

  // KPIs
  const kpis = useMemo(() => {
    const rows = txRows;
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
      rejected: rows.filter((r) => r.status === "rejected" || r.status === "reversed")
        .length,
    };
  }, [data]);

  const kpiData = [
    { label: "Today (loaded window)", value: kpis.today, icon: TrendingUp, tone: "gold" as const, onClick: () => setDatePreset("today") },
    { label: "Pending (loaded)", value: kpis.pending, icon: Clock, tone: "amber" as const, onClick: () => setStatusFilter("pending") },
    { label: "Completed (loaded)", value: kpis.posted, icon: CheckCircle2, tone: "emerald" as const, onClick: () => setStatusFilter("posted") },
    { label: "Failed / reversed (loaded)", value: kpis.rejected, icon: XCircle, tone: "red" as const, onClick: () => setStatusFilter("rejected") },
  ];

  const chips: Array<{ key: string; label: string; active: boolean; onClick: () => void }> = [
    {
      key: "all",
      label: "All",
      active:
        statusFilter === "all" &&
        directionFilter === "all" &&
        channelFilter === "all" &&
        datePreset === "all" &&
        !filesOnly &&
        !overHigh,
      onClick: () => {
        setStatusFilter("all");
        setDirectionFilter("all");
        setChannelFilter("all");
        setDatePreset("all");
        setFilesOnly(false);
        setOverHigh(false);
      },
    },
    { key: "today", label: "Today", active: datePreset === "today", onClick: () => setDatePreset(datePreset === "today" ? "all" : "today") },
    { key: "pending", label: "Pending only", active: statusFilter === "pending", onClick: () => setStatusFilter(statusFilter === "pending" ? "all" : "pending") },
    { key: "high", label: "Over 25k", active: overHigh, onClick: () => setOverHigh((v) => !v) },
    { key: "cash", label: "Cash vault", active: channelFilter === "cash", onClick: () => setChannelFilter(channelFilter === "cash" ? "all" : "cash") },
    { key: "bank", label: "Bank vault", active: channelFilter === "bank", onClick: () => setChannelFilter(channelFilter === "bank" ? "all" : "bank") },
    { key: "dep", label: "Deposits", active: directionFilter === "deposit", onClick: () => setDirectionFilter(directionFilter === "deposit" ? "all" : "deposit") },
    { key: "wd", label: "Withdrawals", active: directionFilter === "withdraw", onClick: () => setDirectionFilter(directionFilter === "withdraw" ? "all" : "withdraw") },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-playfair font-semibold text-foreground">
              {t("nav.transactions")}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">{t("tx.list.allTransactions")}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isAdmin ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                <Eye className="h-3 w-3" /> Read only
              </span>
            ) : null}
            <ExportPdfButton
              title={t("nav.transactions")}
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
                if (DATA_BACKEND === "lambda") {
                  const rows = await api.transactions.list({
                    from: from.toISOString(),
                    to: to.toISOString(),
                    limit: 5000,
                  });
                  return rows.map((r: any) => {
                    const dir = r.direction === "deposit" ? "Deposit" : "Withdraw";
                    const currency = r.currency ?? r.currency_code;
                    const amountMinor = Number(r.amount_minor ?? 0);
                    const sentence = describeTx({
                      direction: r.direction,
                      status: r.status,
                      channel: r.channel ?? "cash",
                       amount: formatMinorOrMissing(amountMinor, currency),
                      customerName: null,
                      comment: r.comment ?? r.description ?? "",
                      isReversal: !!r.reverses_tx_id,
                      isCorrected: !!r.corrected_by_tx_id,
                    });
                    return [
                      r.tx_number,
                      formatDateTime(r.created_at ?? r.posted_at),
                      "—",
                      dir,
                      String(r.channel ?? "—"),
                       currency
                         ? `${formatMinorOrMissing(amountMinor, currency)} ${currency}`
                         : formatMinorOrMissing(amountMinor, currency),
                      String(r.status),
                      "—",
                      sentence,
                    ];
                  });
                }
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
                     amount: formatMinorOrMissing(r.amount_minor, r.currency),
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
                     r.currency
                       ? `${formatMinorOrMissing(r.amount_minor, r.currency)} ${r.currency}`
                       : formatMinorOrMissing(r.amount_minor, r.currency),
                    String(r.status),
                    attCount > 0 ? String(attCount) : "—",
                    sentence,
                  ];
                });
              }}
            />
            <Link to="/app/transactions/new">
              <Button variant="gold" className="gap-1.5">
                <Plus className="h-4 w-4" /> New transaction
              </Button>
            </Link>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiData.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <KpiTile {...k} />
            </motion.div>
          ))}
        </div>

        {/* Chip row */}
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={c.onClick}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                c.active
                  ? "bg-[oklch(from_var(--gold)_l_c_h/0.10)] border-[oklch(from_var(--gold)_l_c_h/0.40)] text-gold shadow-[0_0_10px_oklch(from_var(--gold)_l_c_h/0.10)]"
                  : "bg-surface-2 border-border text-text-secondary hover:border-[oklch(from_var(--gold)_l_c_h/0.30)] hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                <Input
                  className="pl-10 bg-surface-2 border-border focus-visible:border-[var(--gold)] focus-visible:ring-1 focus-visible:ring-[oklch(from_var(--gold)_l_c_h/0.30)]"
                  placeholder={t("tx.list.searchPlaceholder")}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-9 rounded-md border border-border bg-surface-2 px-2.5 text-xs text-foreground"
              >
                <option value="all">{t("tx.list.allStatuses")}</option>
                <option value="pending">{t("tx.status.pending")}</option>
                <option value="posted">{t("tx.status.posted")}</option>
                <option value="rejected">{t("tx.status.rejected")}</option>
                <option value="reversed">{t("tx.status.reversed")}</option>
              </select>

              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
                className="h-9 rounded-md border border-border bg-surface-2 px-2.5 text-xs text-foreground"
              >
                <option value="all">{t("tx.list.allDirections")}</option>
                <option value="deposit">{t("activity.deposits")}</option>
                <option value="withdraw">{t("activity.withdrawals")}</option>
              </select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={datePreset === "custom" ? "default" : "outline"}
                    size="sm"
                    className="h-9 gap-1.5"
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {datePreset === "custom" && (customFrom || customTo)
                      ? `${customFrom ? customFrom.toLocaleDateString() : "…"} – ${customTo ? customTo.toLocaleDateString() : "…"}`
                      : "Custom range"}
                    {datePreset === "custom" ? (
                      <X
                        className="h-3.5 w-3.5 opacity-70 hover:opacity-100"
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
                      <Label className="text-xs text-text-secondary">{t("common.from")}</Label>
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
                      <Label className="text-xs text-text-secondary">{t("common.to")}</Label>
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

              <label className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 h-9 text-xs">
                <Switch checked={filesOnly} onCheckedChange={setFilesOnly} />
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <Paperclip className="h-3.5 w-3.5" /> Has files
                </span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <PremiumCard variant="premium" className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm text-left">
              <thead className="text-[10px] uppercase tracking-wider text-text-secondary bg-[color:var(--surface-2)]/60 border-b border-border">
               <tr>
                 <th className="px-4 py-3">{t("ledger.col.tx")}</th>
                 <th className="px-4 py-3">{t("tx.col.date")}</th>
                 <th className="px-4 py-3">{t("tx.col.time")}</th>
                 <th className="px-4 py-3">{t("tx.col.customer")}</th>
                  <th className="px-4 py-3">{t("tx.col.description")}</th>
                  <th className="px-4 py-3 text-right">{t("tx.col.amount")}</th>
                  <th className="px-4 py-3">{t("tx.col.status")}</th>
                 {isAdmin ? <th className="px-4 py-3 text-right">{t("tx.col.actions")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                     <td colSpan={isAdmin ? 7 : 6} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
                      </td>
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                   <td colSpan={isAdmin ? 7 : 6} className="p-6 text-center text-destructive">
                      Failed to load transactions: {(error as Error).message}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                   <td colSpan={isAdmin ? 7 : 6} className="p-10 text-center text-text-secondary">
                      No transactions match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((tx, i) => (
                    <TxRow
                      key={tx.id}
                      tx={tx}
                      index={i}
                      isAdmin={isAdmin}
                      byId={byNumber}
                      onEdit={setEditing}
                      onOpen={(t) =>
                        navigate({ to: "/app/transactions/$id", params: { id: t.id } })
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Footer strip — pagination */}
          <div className="border-t border-border bg-[color:var(--surface-2)]/30 px-4 py-3 flex items-center justify-between gap-3 text-xs text-text-secondary">
            <span>
              Showing {offset + 1}–{offset + txRows.length} of {fmtTotal(totalCount)} transactions
              <span className="font-mono ml-2">· {PAGE_SIZE} per page</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono">Page {currentPage}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    >
                      Previous
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {offset === 0 ? "You are on the first page." : "Load the previous page"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={nextOffset == null}
                      onClick={() => nextOffset != null && setOffset(nextOffset)}
                    >
                      Next page
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {nextOffset != null
                    ? "Load the next 50 transactions"
                    : "No more transactions."}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </PremiumCard>
      </div>

      <CorrectionDialog tx={editing} onClose={() => setEditing(null)} />
    </TooltipProvider>
  );
}

/* ---------------- Row ---------------- */

function TxRow({
  tx,
  index,
  isAdmin,
  byId,
  onEdit,
  onOpen,
}: {
  tx: Tx;
  index: number;
  isAdmin: boolean;
  byId: Map<string, Tx>;
  onEdit: (tx: Tx) => void;
  onOpen: (tx: Tx) => void;
}) {
  const canEdit =
    isAdmin && tx.status === "posted" && !tx.reverses_tx_id && !tx.corrected_by_tx_id;
  const reverses = tx.reverses_tx_id ? byId.get(tx.reverses_tx_id) : null;
  const isDeposit = tx.direction === "deposit";
  const dt = new Date(tx.created_at);
  const dateStr = dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const amountStr = formatMinorOrMissing(tx.amount_minor, tx.currency);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const sentence = describeTx({
    direction: tx.direction,
    status: tx.status,
    channel: tx.channel,
    amount: amountStr,
    customerName: tx.customer_name,
    comment: tx.comment,
    isReversal: !!tx.reverses_tx_id,
    isCorrected: !!tx.corrected_by_tx_id,
  });

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.5) }}
      className={cn(
        "group cursor-pointer border-b border-border transition-colors hover:bg-[color:var(--surface-2)]/60",
        index % 2 === 1 && "bg-[color:var(--surface-2)]/20",
      )}
      onClick={() => onOpen(tx)}
    >
      <td className="px-4 py-3 align-top">
        <div className="font-mono text-[12px] text-foreground group-hover:text-gold transition-colors">
          {tx.tx_number}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="font-medium text-foreground">{dateStr}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="font-mono text-[12px] text-text-secondary">{timeStr}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="font-medium group-hover:text-gold transition-colors">
          {tx.customer_name ?? "—"}
        </div>
        {tx.customer_account_number ? (
          <div className="text-[11px] font-mono text-text-secondary mt-0.5">
            #{tx.customer_account_number}
            {tx.customer_dahab_number ? (
              <span className="ml-2 text-gold">· {tx.customer_dahab_number}</span>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top max-w-[320px]">
        <div className="flex items-center gap-1.5">
          {isDeposit ? (
            <ArrowDownRight className="h-3.5 w-3.5 text-[var(--success)] shrink-0" />
          ) : (
            <ArrowUpRight className="h-3.5 w-3.5 text-[var(--destructive)] shrink-0" />
          )}
          <span className="truncate text-text-secondary">
            {tx.comment || sentence}
          </span>
        </div>
        {reverses ? (
          <div className="mt-1 text-[10px] text-[var(--warning)] font-mono">
            ↩ reverses {reverses.tx_number}
          </div>
        ) : null}
        {tx.attachment_count > 0 ? (
          <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-text-secondary">
            <Paperclip className="h-3 w-3" /> {tx.attachment_count}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top text-right">
        <div
          className={cn(
            "text-base font-semibold tabular-nums",
            isDeposit ? "text-[var(--success)]" : "text-[var(--destructive)]",
          )}
        >
          {amountStr === "Currency missing" ? amountStr : (isDeposit ? "+" : "−") + amountStr}
        </div>
        <div className="mt-1 flex justify-end">
          <CurrencyBadge currency={tx.currency} />
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <DesignStatusBadge status={tx.status} />
      </td>
      {isAdmin ? (
        <td className="px-4 py-3 text-right align-top" onClick={stop}>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => onEdit(tx)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          ) : (
            <span className="text-xs text-text-secondary">—</span>
          )}
        </td>
      ) : null}
    </motion.tr>
  );
}

/* ---------------- KPI ---------------- */

function KpiTile({
  label,
  value,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: any;
  tone: "gold" | "amber" | "emerald" | "red";
  onClick?: () => void;
}) {
  const toneText: Record<typeof tone, string> = {
    gold: "text-gold",
    amber: "text-[var(--warning)]",
    emerald: "text-[var(--success)]",
    red: "text-[var(--destructive)]",
  };
  const toneRing: Record<typeof tone, string> = {
    gold: "border-[oklch(from_var(--gold)_l_c_h/0.20)] bg-[oklch(from_var(--gold)_l_c_h/0.10)]",
    amber: "border-[oklch(from_var(--warning)_l_c_h/0.30)] bg-[oklch(from_var(--warning)_l_c_h/0.10)]",
    emerald: "border-[oklch(from_var(--success)_l_c_h/0.30)] bg-[oklch(from_var(--success)_l_c_h/0.10)]",
    red: "border-[oklch(from_var(--destructive)_l_c_h/0.30)] bg-[oklch(from_var(--destructive)_l_c_h/0.10)]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left relative overflow-hidden rounded-2xl bg-card border border-border p-5 shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:border-[oklch(from_var(--gold)_l_c_h/0.40)] transition-colors"
    >
      {tone === "gold" && (
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,oklch(from_var(--gold)_l_c_h/0.15),transparent_60%)]" />
      )}
      <div className="relative flex items-center justify-between mb-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-secondary">
          {label}
        </span>
        <span className={cn("p-1.5 rounded-lg border", toneRing[tone])}>
          <Icon className={cn("h-3.5 w-3.5", toneText[tone])} />
        </span>
      </div>
      <div className={cn("relative text-2xl font-semibold tabular-nums", toneText[tone])}>
        {value}
      </div>
    </button>
  );
}

/* ---------------- Correction dialog (unchanged) ---------------- */

function CorrectionDialog({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");

  const nextIdempotencyKey = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const correctThroughCashPosts = async (original: Tx) => {
    if (original.channel !== "cash") {
      throw new ApiError(
        "Bank transaction corrections are not available until the backend correction endpoint is deployed.",
        422,
      );
    }
    if (!original.customer_account_id || !original.vault_account_id) {
      throw new ApiError(
        "This transaction is missing account linkage, so it cannot be reversed from the transaction list.",
        422,
      );
    }

    const vaults = await api.vaults.list();
    const findCashVault = (direction: Tx["direction"]) => {
      const requiredRole = direction === "deposit" ? "receiv" : "pay";
      return vaults.find((vault: any) => {
        const currency = vault.currency_code ?? vault.currency;
        const roleText = String(vault.internal_role ?? vault.vault_role ?? vault.name ?? "").toLowerCase();
        return currency === original.currency && roleText.includes(requiredRole);
      });
    };
    const reverseDirection = original.direction === "deposit" ? "withdraw" : "deposit";
    const reversalVault = findCashVault(reverseDirection);
    const replacementVault = findCashVault(original.direction);
    if (!reversalVault) {
      throw new ApiError(
        `Missing ${reverseDirection === "deposit" ? "Cash Receivable" : "Cash Payable"} vault for ${original.currency}.`,
        422,
      );
    }
    if (amountMinor !== 0 && !replacementVault) {
      throw new ApiError(
        `Missing ${original.direction === "deposit" ? "Cash Receivable" : "Cash Payable"} vault for ${original.currency}.`,
        422,
      );
    }
    const reasonSuffix = trimmedReason ? ` — ${trimmedReason}` : "";
    const reversal = await api.transactions.postCash({
      holder_account_id: original.customer_account_id,
      direction: reverseDirection,
      channel: "cash",
      transaction_category: "cash",
      amount: original.amount_minor,
      currency_code: original.currency,
      vault_account_id: reversalVault.id,
      comment: `Reversal of ${original.tx_number}${reasonSuffix}`.slice(0, 280),
      idempotency_key: nextIdempotencyKey(),
      // Audit linkage — backend ignores unknown fields; safe to pass.
      reverses_tx_id: original.id,
      correction_reason: trimmedReason,
      source_tx_id: original.id,
    } as any);

    if (amountMinor === 0) return reversal;

    return await api.transactions.postCash({
      holder_account_id: original.customer_account_id,
      direction: original.direction,
      channel: "cash",
      transaction_category: "cash",
      amount: amountMinor!,
      currency_code: original.currency,
      vault_account_id: replacementVault!.id,
      comment: trimmedComment,
      idempotency_key: nextIdempotencyKey(),
      corrected_from_tx_id: original.id,
      correction_reason: trimmedReason,
      source_tx_id: original.id,
    } as any);
  };

  useEffect(() => {
    if (tx) {
      setAmount((tx.amount_minor / 100).toFixed(2));
      setComment(tx.comment);
      setReason("");
    }
  }, [tx]);

  // Allow 0 in corrections — a zero amount means "pure reversal of the
  // original entry with no replacement value". parseAmountToMinor rejects 0
  // (used by the new-tx wizard where 0 is invalid), so parse locally here.
  const amountMinor = useMemo<number | null>(() => {
    if (amount === "" || amount == null) return null;
    const cleaned = String(amount).replace(/[, _]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    const n = Math.round(parseFloat(cleaned) * 100);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }, [amount]);
  const trimmedComment = comment.trim();
  const trimmedReason = reason.trim();
  const amountValid = amountMinor !== null && amountMinor >= 0;
  const commentValid = trimmedComment.length >= 3;
  const reasonValid = trimmedReason.length >= 10;
  const ready = !!tx && amountValid && commentValid && reasonValid;
  const missing: string[] = [];
  if (!amountValid) missing.push("a valid amount (0 or greater)");
  if (!commentValid) missing.push("a comment (min 3 characters)");
  if (!reasonValid) missing.push(`a correction reason (min 10 characters, ${trimmedReason.length}/10)`);

  const correct = useMutation({
    mutationFn: async () => {
      if (!tx) throw new Error("No transaction selected");
      if (DATA_BACKEND === "lambda") {
        try {
          // Zero-amount corrections must NEVER call the replacement-style
          // backend endpoint (which would attempt to post a 0-amount entry).
          // Skip straight to the reversal-only fallback path.
          if (amountMinor === 0) {
            return await correctThroughCashPosts(tx);
          }
          return await api.transactions.correct(tx.id, {
            new_amount_minor: amountMinor!,
            new_comment: trimmedComment,
            correction_reason: trimmedReason,
          });
        } catch (e) {
          // Backend correction endpoint may be missing in some environments.
          // Fall back to the cash post/reverse flow for any "endpoint missing"
          // signal (404 / 405 / "Route not found" message), instead of
          // surfacing a misleading "Transaction not found" error.
          const isEndpointMissing =
            e instanceof ApiError &&
            (e.status === 404 || e.status === 405 || /route not found/i.test(e.message ?? ""));
          if (isEndpointMissing) {
            return await correctThroughCashPosts(tx);
          }
          throw e;
        }
      }
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
      const num = newTx?.tx_number ? ` → ${newTx.tx_number}` : "";
      if (amountMinor === 0) {
        toast.success(`Reversed${num}`, {
          description: `${tx?.tx_number ?? "The original entry"} was reversed. No replacement entry was posted.`,
        });
      } else if (newTx?.status === "posted") {
        toast.success(`Correction posted${num}`, {
          description: "The original entry was reversed and the corrected entry is live.",
        });
      } else {
        toast.warning(`Correction queued for admin approval${num}`, {
          description:
            "The corrected amount overdrafts the account or exceeds its debit limit. An admin must approve before it posts.",
        });
      }
      onClose();
    },
    onError: (e: unknown) => {
      // Network failure (offline / DNS / CORS preflight): fetch throws
      // TypeError before any HTTP status is available.
      if (e instanceof TypeError) {
        toast.error("Network error", {
          description:
            "Could not reach the backend. Check your connection and try again.",
        });
        return;
      }
      if (e instanceof ApiError) {
        const msg = e.message || "Correction rejected";
        if (e.status === 401 || e.status === 403) {
          toast.error("Not authorized", {
            description:
              "Your account does not have permission to correct this transaction.",
          });
          return;
        }
        if (e.status === 404) {
          // The endpoint-missing case is handled in the mutationFn fallback,
          // so a 404 reaching here is an actual not-found from a sub-call.
          // Avoid the misleading "Transaction not found" wording.
          toast.error("Correction failed", {
            description: msg || "The backend rejected the correction (HTTP 404).",
          });
          return;
        }
        if (e.status === 409) {
          toast.error("Conflict", {
            description:
              msg ||
              "This transaction has already been corrected or reversed.",
          });
          return;
        }
        if (e.status === 422 || e.status === 400) {
          toast.error("Correction rejected", { description: msg });
          return;
        }
        if (e.status >= 500) {
          toast.error("Backend error", {
            description: `${msg} (HTTP ${e.status}). Please retry shortly.`,
          });
          return;
        }
        toast.error("Correction failed", {
          description: e.status ? `${msg} (HTTP ${e.status})` : msg,
        });
        return;
      }
      const msg = (e as any)?.message || "Unknown error";
      toast.error("Correction failed", { description: msg });
    },
  });

  return (
    <Dialog open={!!tx} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("tx.correctTitle")}</DialogTitle>
          <DialogDescription>
            Posted entries are immutable. This will post a reversing entry that cancels{" "}
            <span className="font-mono">{tx?.tx_number}</span>, then post a new corrected entry.
          </DialogDescription>
        </DialogHeader>

        {tx ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">{t("tx.field.direction")}</div>
                  <div className="capitalize">{tx.direction}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">{t("tx.field.channel")}</div>
                  <div className="capitalize">{tx.channel}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">{t("tx.field.currency")}</div>
                  <div>{tx.currency}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">{t("tx.field.original")}</div>
                  <div className="font-mono">{formatMinorOrMissing(tx.amount_minor, tx.currency)}</div>
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
                <p className="mt-1 text-xs text-destructive">Enter a valid amount.</p>
              ) : amountMinor === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  0.00 means reverse this transaction only. No replacement transaction will be posted.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Use 0 to fully reverse the original transaction.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="new-comment">{t("tx.field.correctedComment")}</Label>
              <Input
                id="new-comment"
                className="mt-1.5"
                value={comment}
                maxLength={280}
                onChange={(e) => setComment(e.target.value)}
              />
              {!commentValid ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Minimum 3 characters ({trimmedComment.length}/3).
                </p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="reason">Correction reason (audited)</Label>
              <Textarea
                id="reason"
                rows={3}
                className="mt-1.5"
                placeholder={t("tx.correctPlaceholder")}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className={cn("mt-1 text-xs", reasonValid ? "text-muted-foreground" : "text-destructive")}>
                Required for audit · minimum 10 characters ({trimmedReason.length}/10).
              </p>
            </div>

            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>{t("tx.controlsApply")}</AlertTitle>
              <AlertDescription>
                If the corrected amount overdrafts the account or exceeds its debit limit, the
                new entry will be queued for admin approval.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <DialogFooter>
          {!ready && tx ? (
            <p className="mr-auto self-center text-xs text-muted-foreground">
              Add {missing.join(", ")} to continue.
            </p>
          ) : null}
          <Button variant="outline" onClick={onClose} disabled={correct.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!ready) {
                toast.error("Cannot post correction yet", {
                  description: `Please provide ${missing.join(", ")}.`,
                });
                return;
              }
              correct.mutate();
            }}
            disabled={correct.isPending}
          >
            {amountMinor === 0
              ? correct.isPending
                ? "Reversing…"
                : "Reverse only"
              : correct.isPending
              ? "Correcting…"
              : "Reverse & post correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
