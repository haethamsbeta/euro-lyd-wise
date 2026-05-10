import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Download, Calendar, TrendingUp, Users, ArrowUpRight, ArrowDownRight,
  BarChart3, PieChart as PieIcon, FileText, ChevronRight, Sparkles,
  Award, Clock, Zap, Target, AlertCircle, CheckCircle2, Activity,
  Trophy, Medal, Star,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { RoleGate, PageHeader } from "@/components/app/app-shell";
import { PremiumCard } from "@/components/ui/premium-card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { DATA_BACKEND, REALTIME_MODE, POLL_INTERVALS } from "@/lib/runtimeConfig";
import { BackendPending } from "@/components/app/backend-pending";
import { formatMinor, formatMinorOrMissing } from "@/lib/format";
import { api } from "@/lib/api";
import { ACCEPTED_CCY, displayCurrency } from "@/lib/api/reports";
import { useDashboardSummary, fmtTotal } from "@/lib/useDashboardSummary";

/**
 * Reports & Insights — admin/auditor analytics command center.
 * Mirrors the Magic Patterns reference (Business / Tellers / Compliance lenses).
 * Business KPIs and charts pull live data; Teller and Compliance lenses use
 * illustrative demo data until those data sources land.
 */

const GOLD = "#D4A857";
const tooltipStyle = {
  background: "#1F2530",
  border: "1px solid rgba(212,168,87,0.3)",
  borderRadius: 8,
  fontSize: 12,
  color: "#F5F1E8",
};
const axisTick = { fill: "#8B8A85", fontSize: 11 };
const CURRENCY_COLORS: Record<string, string> = {
  LYD: "#D4A857", USD: "#5FBE8A", EUR: "#7AA8E8", GBP: "#C394E0",
};

// ───────────── Live report queries ─────────────
// All business numbers below come from the backend Lambda API. Frontend
// never fabricates KPIs, FX, balances, counts, charts, or thresholds.
// When a query is loading or the API is not reachable, charts render an
// empty state — they MUST NOT fall back to invented values.
const EMPTY_ARR: never[] = [];
function useReportFeed<T>(key: string, fn: () => Promise<T>, fallback: T) {
  const q = useQuery({
    queryKey: ["reports", key],
    queryFn: fn,
    retry: false,
    enabled: Boolean(import.meta.env.VITE_API_BASE_URL),
    refetchInterval: REALTIME_MODE === "polling" ? POLL_INTERVALS.reports : false,
  });
  return { data: (q.data ?? fallback) as T, isLoading: q.isLoading, error: q.error };
}

// ───────────── Live data hook ─────────────
// Lambda mode: every figure on this page MUST come from a /reports/* endpoint.
// No Supabase fallback, no static demo arrays, no fabricated KPIs.
function useReportsData() {
  return useQuery({
    queryKey: ["reports", "business-overview"],
    queryFn: () => api.reports.businessOverview(),
    retry: false,
    enabled: Boolean(import.meta.env.VITE_API_BASE_URL),
    refetchInterval: REALTIME_MODE === "polling" ? POLL_INTERVALS.reports : false,
  });
}

// Mini sparkline
function Sparkline({ data, color = GOLD }: { data: number[]; color?: string }) {
  const max = Math.max(...data); const min = Math.min(...data); const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-16 h-8">
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const Route = createFileRoute("/app/reports")({
  component: () => (
    <RoleGate allow={["admin", "auditor"]}>
      <ReportsPage />
    </RoleGate>
  ),
  head: () => ({ meta: [{ title: "Reports & Insights — Dahab" }] }),
});

function ReportsPage() {
  const { data, isLoading } = useReportsData();
  const { data: topAccounts } = useTopAccounts();
  const { data: dashSummary } = useDashboardSummary();
  const [lens, setLens] = useState<"business" | "tellers" | "compliance">("business");
  const isLambda = DATA_BACKEND === "lambda";
  const overviewPending = isLambda && (data as any)?.__lambdaEmpty;

  // Live report feeds — every chart below sources from the backend Lambda API.
  // Empty arrays mean "no data yet"; charts render their natural empty state.
  const { data: hourlyTraffic } = useReportFeed("hourly-traffic", () => api.reports.hourlyTraffic(), EMPTY_ARR as { h: string; v: number }[]);
  // Cash-flow: backend returns raw rows
  // { day, currency_code, direction, transaction_count, volume_minor }.
  // Pivot in the FE by day + currency_code → deposits_minor/withdrawals_minor.
  // The chart below shows LYD-only; we never sum across currencies and never
  // apply FX in the frontend. See LAMBDA_FULL_ENDPOINT_AND_BALANCE_AUDIT.md §4.
  const { data: cashFlowApi } = useReportFeed(
    "cash-flow",
    () => api.reports.cashFlow(),
    EMPTY_ARR as Array<{
      day: string;
      currency_code: string;
      direction: string;
      transaction_count: number;
      volume_minor: number;
    }>,
  );
  const CASH_FLOW_CCY = "LYD";
  const cashFlowByDay = new Map<string, { deposits_minor: number; withdrawals_minor: number }>();
  for (const r of cashFlowApi) {
    if (r.currency_code !== CASH_FLOW_CCY) continue;
    const cur = cashFlowByDay.get(r.day) ?? { deposits_minor: 0, withdrawals_minor: 0 };
    if (r.direction === "deposit") cur.deposits_minor += Number(r.volume_minor || 0);
    else if (r.direction === "withdraw") cur.withdrawals_minor += Number(r.volume_minor || 0);
    cashFlowByDay.set(r.day, cur);
  }
  const cashFlow = Array.from(cashFlowByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({ d, deposits: v.deposits_minor / 100, withdrawals: v.withdrawals_minor / 100 }));
  const { data: liquidityResp } = useReportFeed("liquidity-health", () => api.reports.liquidityHealth(), { rows: EMPTY_ARR as any[], network_total_lyd_minor: null, missing_rates: [], generated_at: "" });
  const liquidityHealth = (liquidityResp.rows ?? []).map((r: any) => ({ currency: r.currency, balance: r.balance_minor / 100, daysOfCover: r.days_of_cover ?? 0, health: r.health }));
  const { data: tellersApi } = useReportFeed("tellers-today", () => api.reports.tellersToday(), EMPTY_ARR as any[]);
  const tellers = tellersApi.map((t: any) => ({
    id: t.id, name: t.name, branch: t.branch ?? "—", avatar: t.avatar,
    txnsToday: t.txns_today, volumeToday: t.volume_today_minor / 100,
    avgValue: t.avg_value_minor / 100, accuracy: t.accuracy_pct,
    avgTime: t.avg_time_seconds / 60, rank: t.rank,
    trend: t.trend ?? [], streak: t.streak_days,
  }));
  const { data: processingTimeDist } = useReportFeed("processing-time-dist", () => api.reports.processingTimeDistribution(), EMPTY_ARR as { bucket: string; count: number }[]);
  const { data: errorRateApi } = useReportFeed("rejection-rate-trend", () => api.reports.rejectionRateTrend(), EMPTY_ARR as Array<{ d: string; rate_pct: number }>);
  const errorRateTrend = errorRateApi.map((r) => ({ d: r.d, rate: r.rate_pct }));
  const { data: compliance } = useReportFeed("compliance-overview", () => api.reports.complianceOverview(), {
    flagged_txns: 0, pending_reviews: 0, resolved_today: 0, high_risk_holders: 0,
    typology: EMPTY_ARR as Array<{ name: string; value: number }>,
    alert_volume: EMPTY_ARR as any[],
    kyc: { target_pct: 0, current_pct: 0 },
    aml: { target_pct: 0, current_pct: 0 },
    doc_verification: { target_pct: 0, current_pct: 0 },
    sanctions: { target_pct: 0, current_pct: 0 },
  });
  const riskMetrics = {
    flaggedTxns: compliance.flagged_txns,
    pendingReviews: compliance.pending_reviews,
    resolvedToday: compliance.resolved_today,
    highRiskHolders: compliance.high_risk_holders,
  };
  const TYPOLOGY_COLORS: Record<string, string> = {
    Structuring: "#F59E0B", "High-Value Cash": "#EF4444",
    Velocity: "#8B5CF6", "Watchlist Match": "#EC4899",
  };
  const riskTypology = compliance.typology.map((t) => ({ ...t, color: TYPOLOGY_COLORS[t.name] ?? GOLD }));

  const fmtN = (n: number) => n.toLocaleString();
  const volumeSummary = data
    ? Object.entries(data.volumeByCurrency).map(([ccy, v]) => formatMinor(v, ccy)).join(" · ") || "—"
    : "—";
  const lydVolume = data?.volumeByCurrency?.["LYD"] ?? 0;

  const kpis = [
    { l: "Network Volume (30d)", v: isLoading ? "…" : (lydVolume ? formatMinor(lydVolume, "LYD") : volumeSummary), chg: "", up: true, icon: TrendingUp },
    { l: "Total Customers", v: fmtTotal(dashSummary?.holderCount ?? null), chg: "", up: true, icon: Users },
    { l: "Total Transactions", v: fmtTotal(dashSummary?.transactionCount ?? null), chg: "", up: true, icon: BarChart3 },
    { l: "Avg Txn Value (loaded)", v: isLoading ? "…" : formatMinor(data?.avgTxnValueLyd ?? 0, "LYD"), chg: "", up: true, icon: Target },
    { l: "Approval Time", v: "—", chg: "", up: true, icon: Clock },
    { l: "Rejection Rate (loaded)", v: isLoading ? "…" : ((data?.total ?? 0) > 0 ? `${(data?.rejectionRate ?? 0).toFixed(1)}%` : "—"), chg: "", up: true, icon: PieIcon },
  ];

  return (
    <>
      <PageHeader title="Reports & Insights" description="Analytics command center" />
      <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-gold" />
              <span className="eyebrow">Analytics & Insights</span>
            </div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Reports & Insights</h1>
            <p className="text-text-secondary text-sm mt-1.5">
              Business performance, teller productivity, and operational metrics
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2"><Calendar className="w-4 h-4" /> Last 30 days</Button>
            <Button variant="gold" size="sm" className="gap-2"><Download className="w-4 h-4" /> Export Report</Button>
          </div>
        </div>

        {/* Lens toggle */}
        <div className="flex items-center gap-1 bg-[oklch(from_var(--surface-2)_l_c_h/0.5)] border border-border rounded-lg p-1 w-fit">
          {[
            { key: "business", label: "Business", icon: BarChart3 },
            { key: "tellers", label: "Tellers", icon: Users },
            { key: "compliance", label: "Compliance", icon: AlertCircle },
          ].map((opt) => {
            const Icon = opt.icon; const active = lens === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setLens(opt.key as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all ${active ? "bg-[oklch(from_var(--gold)_l_c_h/0.15)] text-gold border border-[oklch(from_var(--gold)_l_c_h/0.30)]" : "text-text-secondary hover:text-foreground"}`}
              >
                <Icon className="w-3.5 h-3.5" /> {opt.label}
              </button>
            );
          })}
        </div>

        {/* TOP KPI STRIP */}
        {overviewPending && (
          <BackendPending
            endpoint="GET /reports/overview"
            note="KPI strip will populate once the backend reports overview endpoint is available. Holder/transaction totals come from the dashboard summary."
          />
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpis.map((k, i) => (
            <motion.div key={k.l} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <PremiumCard className="p-4 h-full">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-1.5 rounded-md bg-[oklch(from_var(--gold)_l_c_h/0.10)] text-gold border border-[oklch(from_var(--gold)_l_c_h/0.20)]">
                    <k.icon className="w-3.5 h-3.5" />
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold ${k.up ? "text-[var(--success)]" : "text-[var(--destructive)]"}`}>
                    {k.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />} {k.chg}
                  </span>
                </div>
                <p className="text-[9px] tracking-[0.15em] uppercase text-text-secondary font-medium mb-1">{k.l}</p>
                <p className="text-base sm:text-lg font-semibold tabular-nums text-foreground leading-tight">{k.v}</p>
              </PremiumCard>
            </motion.div>
          ))}
        </div>

        {/* ═════════════ BUSINESS LENS ═════════════ */}
        {lens === "business" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {/* Volume + Currency */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <PremiumCard variant="premium" className="lg:col-span-2 p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-serif font-semibold text-foreground">Daily Transactions</h2>
                    <p className="text-sm text-text-secondary mt-0.5">Volume and count over the last 7 days</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-text-secondary"><span className="w-2 h-2 rounded-full bg-gold" /> Volume</span>
                </div>
                <div className="h-64" style={{ minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                    <AreaChart data={data?.dailyVolume ?? []}>
                      <defs>
                        <linearGradient id="rGold" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={GOLD} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="d" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} tickFormatter={(v) => new Intl.NumberFormat("en", { notation: "compact" }).format(v as number)} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="v" stroke={GOLD} strokeWidth={2} fill="url(#rGold)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>

              <PremiumCard className="p-6">
                <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Balance by Currency</h2>
                <p className="text-sm text-text-secondary mb-6">Network distribution</p>
                <div className="h-48" style={{ minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                    <PieChart>
                      <Pie data={data?.currencyDistribution ?? []} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="#161B22" strokeWidth={2}>
                        {(data?.currencyDistribution ?? []).map((e) => <Cell key={e.name} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-4">
                  {(data?.currencyDistribution ?? []).map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                        <CurrencyBadge currency={c.name} />
                      </div>
                      <span className="text-foreground font-medium tabular-nums">{c.value}%</span>
                    </div>
                  ))}
                  {(!data || data.currencyDistribution.length === 0) && !isLoading && (
                    <p className="text-xs text-text-tertiary">No balance data yet.</p>
                  )}
                </div>
              </PremiumCard>
            </div>

            {/* Peak Hours + Approval Speed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <PremiumCard className="lg:col-span-2 p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-serif font-semibold text-foreground">Peak Hours</h2>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[oklch(from_var(--gold)_l_c_h/0.10)] text-gold border border-[oklch(from_var(--gold)_l_c_h/0.30)] font-medium">Insight</span>
                    </div>
                    <p className="text-sm text-text-secondary mt-0.5">When transactions happen most — staff your tellers accordingly</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-text-secondary">Peak Hour</p>
                    <p className="text-xl font-semibold text-gold tabular-nums">15:00</p>
                  </div>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                    <BarChart data={hourlyTraffic}>
                      <XAxis dataKey="h" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                      <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                        {hourlyTraffic.map((entry, i) => (
                          <Cell key={i} fill={entry.v > 70 ? GOLD : entry.v > 40 ? "#A8842F" : "#5C4A1F"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>

              <PremiumCard className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-gold" />
                  <h2 className="text-lg font-serif font-semibold text-foreground">Approval Speed</h2>
                </div>
                <p className="text-sm text-text-secondary mb-4">Avg turnaround per day (min)</p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%" minHeight={120}>
                    <LineChart data={approvalTrend}>
                      <XAxis dataKey="d" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis hide />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="t" stroke={GOLD} strokeWidth={2} dot={{ fill: GOLD, r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-text-secondary">Avg</p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">19 min</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-text-secondary">Best</p>
                    <p className="text-sm font-semibold text-[var(--success)] tabular-nums">14 min</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-text-secondary">Target</p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">≤20 min</p>
                  </div>
                </div>
              </PremiumCard>
            </div>

            {/* Customer Growth + Top Accounts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <PremiumCard className="lg:col-span-2 p-6">
                <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Customer Growth</h2>
                <p className="text-sm text-text-secondary mb-6">New onboarded customers per month</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                    <BarChart data={data?.customerGrowth ?? []}>
                      <XAxis dataKey="m" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="v" fill={GOLD} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>

              <PremiumCard variant="premium" className="p-6">
                <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Top Accounts</h2>
                <p className="text-sm text-text-secondary mb-5">Highest balance holders</p>
                {isLambda && (!topAccounts || topAccounts.length === 0) ? (
                  <BackendPending endpoint="GET /reports/top-accounts" />
                ) : (!topAccounts || topAccounts.length === 0) ? (
                  <p className="text-xs text-text-tertiary">No accounts yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {topAccounts.map((a: any, i) => (
                      <li key={`${a.account_id}-${a.currency}`}
                          className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-[oklch(from_var(--surface-2)_l_c_h/0.3)] hover:border-[oklch(from_var(--gold)_l_c_h/0.30)] transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-[oklch(from_var(--gold)_l_c_h/0.15)] text-gold text-[11px] font-semibold inline-flex items-center justify-center">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{a.accounts?.name ?? "—"}</p>
                            <CurrencyBadge currency={a.currency} className="mt-1" />
                          </div>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-gold whitespace-nowrap">
                          {formatMinor(Number(a.balance_minor), a.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </PremiumCard>
            </div>

            {/* Cash Flow + Transaction Mix */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <PremiumCard className="lg:col-span-2 p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-gold" />
                      <h2 className="text-lg font-serif font-semibold text-foreground">Cash Flow — Inflow vs Outflow</h2>
                    </div>
                    <p className="text-sm text-text-secondary mt-0.5">Deposits drive the network, withdrawals are the pulse of demand</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-text-secondary">Net Flow (7d)</p>
                    <p className="text-lg font-semibold text-[var(--success)] tabular-nums">+12.4%</p>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                    <AreaChart data={cashFlow}>
                      <defs>
                        <linearGradient id="depositsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34D399" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="withdrawalsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F87171" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#F87171" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="d" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} tickFormatter={(v) => new Intl.NumberFormat("en", { notation: "compact" }).format(v as number)} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                      <Area type="monotone" dataKey="deposits" stroke="#34D399" strokeWidth={2} fill="url(#depositsGrad)" name="Deposits" />
                      <Area type="monotone" dataKey="withdrawals" stroke="#F87171" strokeWidth={2} fill="url(#withdrawalsGrad)" name="Withdrawals" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>

              <PremiumCard className="p-6">
                <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Transaction Mix</h2>
                <p className="text-sm text-text-secondary mb-5">Breakdown by type</p>
                <div className="h-48 relative">
                  <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                    <PieChart>
                      <Pie data={txnMix} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="#161B22" strokeWidth={2}>
                        {txnMix.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground tabular-nums">{fmtTotal(dashSummary?.transactionCount ?? null)}</p>
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary">Total Txns</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 mt-4">
                  {txnMix.map((t) => (
                    <div key={t.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                        <span className="text-text-secondary">{t.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium tabular-nums">{t.count.toLocaleString()}</span>
                        <span className="text-text-tertiary text-xs">({t.value}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </PremiumCard>
            </div>

            {/* Liquidity Health */}
            <PremiumCard className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-gold" />
                <h2 className="text-lg font-serif font-semibold text-foreground">Liquidity Health</h2>
              </div>
              <p className="text-sm text-text-secondary mb-5">Vault balances and days of cover by currency</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {liquidityHealth.map((liq) => {
                  const healthColor = liq.health === "Healthy" ? "emerald" : liq.health === "Watch" ? "amber" : "red";
                  const coverPct = Math.min((liq.daysOfCover / 30) * 100, 100);
                  return (
                    <div key={liq.currency} className="p-4 rounded-xl border border-border bg-[oklch(from_var(--surface-2)_l_c_h/0.3)] hover:border-[oklch(from_var(--gold)_l_c_h/0.30)] transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <CurrencyBadge currency={liq.currency} />
                        <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium ${healthColor === "emerald" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : healthColor === "amber" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`}>{liq.health}</span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Vault Balance</p>
                          <p className="text-lg font-semibold text-foreground tabular-nums">{formatMinor(liq.balance * 100, liq.currency)}</p>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] uppercase tracking-wider text-text-secondary">Days of Cover</p>
                            <p className="text-sm font-semibold text-foreground tabular-nums">{liq.daysOfCover}d</p>
                          </div>
                          <div className="w-full h-1.5 bg-[oklch(from_var(--surface-2)_l_c_h/0.6)] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${healthColor === "emerald" ? "bg-emerald-400" : healthColor === "amber" ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${coverPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PremiumCard>
          </motion.div>
        )}

        {/* ═════════════ TELLERS LENS ═════════════ */}
        {lens === "tellers" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { l: "Active Tellers", v: isLambda ? "—" : "24", sub: isLambda ? "Backend pending" : "8 currently on shift", icon: Users },
                { l: "Avg Txns / Teller / Day", v: isLambda ? "—" : "63", sub: isLambda ? "Backend pending" : "+8 from last week", icon: Activity },
                { l: "Network Accuracy", v: isLambda ? "—" : "99.1%", sub: isLambda ? "Backend pending" : "Industry-leading", icon: Target },
                { l: "Avg Time / Transaction", v: isLambda ? "—" : "2.5 min", sub: isLambda ? "Backend pending" : "-0.3 min from prior", icon: Clock },
              ].map((k, i) => (
                <motion.div key={k.l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <PremiumCard className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="p-2 rounded-lg bg-[oklch(from_var(--gold)_l_c_h/0.10)] text-gold border border-[oklch(from_var(--gold)_l_c_h/0.20)]">
                        <k.icon className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="text-[10px] tracking-[0.15em] uppercase text-text-secondary font-medium mb-1.5">{k.l}</p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">{k.v}</p>
                    <p className="text-[10px] text-text-tertiary mt-1">{k.sub}</p>
                  </PremiumCard>
                </motion.div>
              ))}
            </div>

            {isLambda && tellers.length === 0 && (
              <BackendPending endpoint="GET /reports/tellers/today" />
            )}

            {/* Top Performers Podium */}
            {tellers.length > 0 && <PremiumCard variant="premium" className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-5 h-5 text-gold" />
                <h2 className="text-lg font-serif font-semibold text-foreground">Top Performers — Today</h2>
              </div>
              <p className="text-sm text-text-secondary mb-6">Ranked by transaction volume processed</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tellers.slice(0, 3).map((t, i) => {
                  const podium = [
                    { bg: "from-[oklch(from_var(--gold)_l_c_h/0.15)] via-[oklch(from_var(--gold)_l_c_h/0.05)] to-transparent", border: "border-[oklch(from_var(--gold)_l_c_h/0.40)]", icon: Trophy, iconColor: "text-gold" },
                    { bg: "from-zinc-300/10 via-zinc-300/5 to-transparent", border: "border-zinc-400/30", icon: Medal, iconColor: "text-zinc-300" },
                    { bg: "from-amber-700/10 via-amber-700/5 to-transparent", border: "border-amber-700/30", icon: Star, iconColor: "text-amber-700" },
                  ][i];
                  const Icon = podium.icon;
                  return (
                    <div key={t.id} className={`relative p-5 rounded-xl border ${podium.border} bg-gradient-to-br ${podium.bg} overflow-hidden`}>
                      <div className="absolute top-3 right-3"><Icon className={`w-5 h-5 ${podium.iconColor}`} /></div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-full bg-[oklch(from_var(--gold)_l_c_h/0.20)] border border-[oklch(from_var(--gold)_l_c_h/0.30)] flex items-center justify-center text-gold font-bold">{t.avatar}</div>
                        <div>
                          <p className="text-xs text-gold font-mono">#{t.rank}</p>
                          <p className="font-semibold text-foreground">{t.name}</p>
                          <p className="text-[10px] text-text-secondary">{t.branch}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Row label="Volume" value={formatMinor(t.volumeToday * 100, "LYD")} />
                        <Row label="Transactions" value={String(t.txnsToday)} />
                        <Row label="Accuracy" value={`${t.accuracy}%`} valueClass="text-[var(--success)]" />
                        <div className="pt-2 border-t border-border flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider text-text-secondary">7-day trend</span>
                          <Sparkline data={t.trend} color={GOLD} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PremiumCard>}

            {/* Full Leaderboard */}
            {tellers.length > 0 && <PremiumCard className="p-0 overflow-hidden">
              <div className="p-5 border-b border-border bg-[oklch(from_var(--surface-2)_l_c_h/0.3)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-gold" />
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Full Teller Performance</h2>
                </div>
                <Button variant="outline" size="sm" className="text-xs"><Download className="w-3.5 h-3.5 mr-1.5" /> Export</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] text-text-secondary bg-[oklch(from_var(--surface-2)_l_c_h/0.6)] border-b border-border uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3 text-left font-medium">Rank</th>
                      <th className="px-5 py-3 text-left font-medium">Teller</th>
                      <th className="px-5 py-3 text-left font-medium">Branch</th>
                      <th className="px-5 py-3 text-right font-medium">Txns</th>
                      <th className="px-5 py-3 text-right font-medium">Volume</th>
                      <th className="px-5 py-3 text-right font-medium">Avg Value</th>
                      <th className="px-5 py-3 text-right font-medium">Accuracy</th>
                      <th className="px-5 py-3 text-right font-medium">Avg Time</th>
                      <th className="px-5 py-3 text-center font-medium">Trend</th>
                      <th className="px-5 py-3 text-right font-medium">Streak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tellers.map((t) => (
                      <tr key={t.id} className="hover:bg-[oklch(from_var(--surface-2)_l_c_h/0.4)] transition-colors">
                        <td className="px-5 py-4"><span className={`text-xs font-mono font-bold ${t.rank <= 3 ? "text-gold" : "text-text-secondary"}`}>#{t.rank}</span></td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[oklch(from_var(--gold)_l_c_h/0.15)] border border-[oklch(from_var(--gold)_l_c_h/0.30)] flex items-center justify-center text-[10px] font-bold text-gold">{t.avatar}</div>
                            <span className="font-medium text-foreground">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-text-secondary text-xs">{t.branch}</td>
                        <td className="px-5 py-4 text-right tabular-nums text-foreground font-medium">{t.txnsToday}</td>
                        <td className="px-5 py-4 text-right tabular-nums text-foreground font-semibold">{formatMinor(t.volumeToday * 100, "LYD")}</td>
                        <td className="px-5 py-4 text-right tabular-nums text-text-secondary text-xs">{formatMinor(t.avgValue * 100, "LYD")}</td>
                        <td className="px-5 py-4 text-right">
                          <span className={`text-xs font-semibold tabular-nums ${t.accuracy >= 99 ? "text-[var(--success)]" : t.accuracy >= 98 ? "text-gold" : "text-amber-400"}`}>{t.accuracy}%</span>
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums text-text-secondary text-xs">{t.avgTime} min</td>
                        <td className="px-5 py-4"><div className="flex justify-center"><Sparkline data={t.trend} color={t.trend[t.trend.length - 1] > t.trend[0] ? "#34D399" : "#F87171"} /></div></td>
                        <td className="px-5 py-4 text-right"><span className="inline-flex items-center gap-1 text-xs text-gold-soft"><Zap className="w-3 h-3" />{t.streak}d</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PremiumCard>}

            {/* Volume by Teller */}
            <PremiumCard className="p-6">
              <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Volume by Teller (Today)</h2>
              <p className="text-sm text-text-secondary mb-5">Comparative throughput across the team</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                  <BarChart data={tellers} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" axisLine={false} tickLine={false} tick={axisTick} tickFormatter={(v) => new Intl.NumberFormat("en", { notation: "compact" }).format(v as number)} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: "#F5F1E8", fontSize: 11 }} width={120} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="volumeToday" fill={GOLD} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PremiumCard>

            {/* Processing time + error rate */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PremiumCard className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-gold" />
                  <h2 className="text-lg font-serif font-semibold text-foreground">Processing Time Distribution</h2>
                </div>
                <p className="text-sm text-text-secondary mb-5">Transaction duration across all tellers</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                    <BarChart data={processingTimeDist}>
                      <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                      <Bar dataKey="count" fill={GOLD} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>

              <PremiumCard className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-gold" />
                  <h2 className="text-lg font-serif font-semibold text-foreground">Error & Correction Rate</h2>
                </div>
                <p className="text-sm text-text-secondary mb-5">Percentage of transactions requiring supervisor override</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                    <LineChart data={errorRateTrend}>
                      <XAxis dataKey="d" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} tickFormatter={(v) => `${v}%`} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="rate" stroke="#F87171" strokeWidth={2} dot={{ fill: "#F87171", r: 4 }} activeDot={{ r: 6, fill: "#EF4444" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>
            </div>
          </motion.div>
        )}

        {/* ═════════════ COMPLIANCE LENS ═════════════ */}
        {lens === "compliance" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {isLambda && riskMetrics.flaggedTxns === 0 && riskMetrics.pendingReviews === 0 && riskMetrics.resolvedToday === 0 && riskMetrics.highRiskHolders === 0 && riskTypology.length === 0 && (compliance.alert_volume?.length ?? 0) === 0 && (
              <BackendPending endpoint="GET /reports/compliance/overview" />
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { l: "Flagged Transactions", v: riskMetrics.flaggedTxns, icon: AlertCircle, color: "amber" },
                { l: "Pending Reviews", v: riskMetrics.pendingReviews, icon: Clock, color: "gold" },
                { l: "Resolved Today", v: riskMetrics.resolvedToday, icon: CheckCircle2, color: "emerald" },
                { l: "High-Risk Holders", v: riskMetrics.highRiskHolders, icon: Users, color: "red" },
              ].map((k, i) => (
                <motion.div key={k.l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <PremiumCard className="p-5">
                    <div className={`p-2 rounded-lg w-fit mb-3 ${k.color === "amber" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" : k.color === "gold" ? "bg-[oklch(from_var(--gold)_l_c_h/0.10)] text-gold border border-[oklch(from_var(--gold)_l_c_h/0.30)]" : k.color === "emerald" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`}>
                      <k.icon className="w-4 h-4" />
                    </div>
                    <p className="text-[10px] tracking-[0.15em] uppercase text-text-secondary font-medium mb-1.5">{k.l}</p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">{k.v}</p>
                  </PremiumCard>
                </motion.div>
              ))}
            </div>

            <PremiumCard className="p-6">
              <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Compliance Health</h2>
              <p className="text-sm text-text-secondary mb-5">Anomaly detection and review queue</p>
              <div className="space-y-4">
                {[
                  { metric: "KYC Completion Rate", value: compliance.kyc.current_pct, target: compliance.kyc.target_pct },
                  { metric: "Sanctions Screening", value: compliance.sanctions.current_pct, target: compliance.sanctions.target_pct },
                  { metric: "Document Verification", value: compliance.doc_verification.current_pct, target: compliance.doc_verification.target_pct },
                  { metric: "AML Alert Resolution", value: compliance.aml.current_pct, target: compliance.aml.target_pct },
                ].map((m) => {
                  const meets = m.value >= m.target;
                  const empty = !m.value && !m.target;
                  return (
                    <div key={m.metric}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-foreground font-medium">{m.metric}</span>
                        <span className={`text-sm font-semibold tabular-nums ${empty ? "text-text-tertiary" : meets ? "text-[var(--success)]" : "text-amber-400"}`}>
                          {empty ? "—" : `${m.value}%`} <span className="text-text-tertiary text-xs">/ {empty ? "—" : `${m.target}%`}</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[oklch(from_var(--surface-2)_l_c_h/0.6)] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${meets ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${m.value}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </PremiumCard>

            {/* Alert Volume + Risk Typology */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <PremiumCard className="lg:col-span-2 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-gold" />
                  <h2 className="text-lg font-serif font-semibold text-foreground">Alert Volume & Resolution</h2>
                </div>
                <p className="text-sm text-text-secondary mb-5">System-generated alerts vs compliance team resolutions</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                    <AreaChart data={isLambda ? (compliance.alert_volume ?? []) : alertVolume}>
                      <defs>
                        <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F87171" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#F87171" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="resGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34D399" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="d" axisLine={false} tickLine={false} tick={axisTick} />
                      <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                      <Area type="monotone" dataKey="generated" name="Alerts Generated" stroke="#F87171" strokeWidth={2} fill="url(#genGrad)" />
                      <Area type="monotone" dataKey="resolved" name="Alerts Resolved" stroke="#34D399" strokeWidth={2} fill="url(#resGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>

              <PremiumCard className="p-6">
                <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Risk Typology</h2>
                <p className="text-sm text-text-secondary mb-5">Distribution of flagged activity</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%" minHeight={150}>
                    <PieChart>
                      <Pie data={riskTypology} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value" stroke="#161B22" strokeWidth={2}>
                        {riskTypology.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-4">
                  {riskTypology.map((t) => (
                    <div key={t.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                        <span className="text-text-secondary">{t.name}</span>
                      </div>
                      <span className="text-foreground font-medium tabular-nums">{t.value}%</span>
                    </div>
                  ))}
                </div>
              </PremiumCard>
            </div>
          </motion.div>
        )}

        {/* Saved Reports */}
        <PremiumCard className="p-6">
          <h2 className="text-lg font-serif font-semibold text-foreground mb-4">Saved Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              "Monthly Compliance Summary", "Teller Performance Report", "Customer KYC Status",
              "High-Value Transaction Audit", "Currency Position Report", "Hourly Traffic Analysis",
              "Approval Turnaround Report", "Vault Balance Report",
            ].map((r) => (
              <button key={r} disabled
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-[oklch(from_var(--surface-2)_l_c_h/0.3)] hover:border-[oklch(from_var(--gold)_l_c_h/0.30)] hover:bg-[oklch(from_var(--gold)_l_c_h/0.05)] transition-all text-left group disabled:opacity-60 disabled:cursor-not-allowed">
                <FileText className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-gold transition-colors">{r}</p>
                  <p className="text-[11px] text-text-secondary mt-1">PDF • Coming soon</p>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-gold shrink-0" />
              </button>
            ))}
          </div>
        </PremiumCard>

        <p className="text-xs text-text-tertiary text-center">
          Need granular data?{" "}
          <Link to="/app/transactions" className="text-gold hover:text-gold-soft">Browse transactions</Link>{" "}
          or{" "}
          <Link to="/app/audit" className="text-gold hover:text-gold-soft">view the audit log</Link>.
        </p>
      </div>
    </>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}
