import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, TrendingUp, Users, BarChart3, PieChart as PieIcon, Download, Calendar, FileText, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { RoleGate, PageHeader } from "@/components/app/app-shell";
import { PremiumCard } from "@/components/ui/premium-card";
import { KpiCard } from "@/components/app/kpi-card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/app/section-header";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatMinor } from "@/lib/format";

/**
 * Reports & Insights — admin/auditor analytics command center.
 * Visual scaffold matches the uploaded mockup. Data hooks for real
 * KPIs / charts are wired in follow-up edits; this page already uses
 * the production design tokens so the look is final.
 */

const CURRENCY_COLORS: Record<string, string> = {
  LYD: "#D4A857",
  USD: "#5FBE8A",
  EUR: "#7AA8E8",
  GBP: "#C394E0",
};
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function useReportsData() {
  return useQuery({
    queryKey: ["reports", "overview"],
    queryFn: async () => {
      const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
      const since7 = new Date(Date.now() - 6 * 86400_000); // 7-day window incl today
      since7.setHours(0, 0, 0, 0);

      const [txRes, holdersRes, balancesRes, holderHistoryRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, currency, amount_minor, status, created_at")
          .gte("created_at", since30),
        supabase.from("account_holders").select("id, created_at"),
        supabase.from("account_balances").select("currency, balance_minor"),
        supabase
          .from("transactions")
          .select("created_at")
          .gte("created_at", since7.toISOString()),
      ]);

      const tx = txRes.data ?? [];
      const holders = holdersRes.data ?? [];
      const balances = balancesRes.data ?? [];
      const recent = holderHistoryRes.data ?? [];

      const total = tx.length;
      const posted = tx.filter((t) => t.status === "posted").length;
      const rejected = tx.filter((t) => t.status === "rejected").length;
      const rejectionRate = total ? (rejected / total) * 100 : 0;

      // Volume by currency (minor units)
      const volumeByCurrency: Record<string, number> = {};
      tx.filter((t) => t.status === "posted").forEach((t) => {
        volumeByCurrency[t.currency] = (volumeByCurrency[t.currency] ?? 0) + Number(t.amount_minor ?? 0);
      });

      // Daily 7-day series
      const dayBuckets: { d: string; date: string; v: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        dayBuckets.push({
          d: DAY_LABELS[d.getDay()],
          date: d.toISOString().slice(0, 10),
          v: 0,
        });
      }
      recent.forEach((r) => {
        const key = new Date(r.created_at).toISOString().slice(0, 10);
        const b = dayBuckets.find((x) => x.date === key);
        if (b) b.v += 1;
      });

      // Currency distribution from balances (by share of minor totals)
      const balByCcy: Record<string, number> = {};
      balances.forEach((b) => {
        balByCcy[b.currency] = (balByCcy[b.currency] ?? 0) + Number(b.balance_minor ?? 0);
      });
      const totalBal = Object.values(balByCcy).reduce((a, b) => a + b, 0);
      const currencyDistribution = Object.entries(balByCcy)
        .map(([name, raw]) => ({
          name,
          raw,
          value: totalBal ? Math.round((raw / totalBal) * 1000) / 10 : 0,
          color: CURRENCY_COLORS[name] ?? "#A8842F",
        }))
        .sort((a, b) => b.raw - a.raw);

      // Customer growth — last 7 months
      const monthBuckets: { m: string; key: string; v: number }[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthBuckets.push({
          m: MONTH_LABELS[d.getMonth()],
          key: `${d.getFullYear()}-${d.getMonth()}`,
          v: 0,
        });
      }
      holders.forEach((h: any) => {
        const dt = new Date(h.created_at);
        const k = `${dt.getFullYear()}-${dt.getMonth()}`;
        const b = monthBuckets.find((x) => x.key === k);
        if (b) b.v += 1;
      });

      return {
        total,
        posted,
        rejected,
        rejectionRate,
        holdersCount: holders.length,
        volumeByCurrency,
        dailyVolume: dayBuckets,
        currencyDistribution,
        customerGrowth: monthBuckets,
      };
    },
  });
}

function useTopAccounts() {
  return useQuery({
    queryKey: ["reports", "top-accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_balances")
        .select("balance_minor, currency, account_id, accounts(name)")
        .order("balance_minor", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });
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

  const fmtN = (n: number) => n.toLocaleString();
  const volumeSummary = data
    ? Object.entries(data.volumeByCurrency)
        .map(([ccy, v]) => formatMinor(v, ccy))
        .join(" · ") || "—"
    : "—";

  const tooltipStyle = {
    background: "#1F2530",
    border: "1px solid rgba(212,168,87,0.3)",
    borderRadius: 8,
    fontSize: 12,
    color: "#F5F1E8",
  };
  const axisTick = { fill: "#8B8A85", fontSize: 11 };

  return (
    <>
      <PageHeader title="Reports & Insights" description="Analytics command center" />
      <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8 pb-12">
        <SectionHeader
          eyebrow="Analytics"
          title="Reports & Insights"
          subtitle="Network performance, balances, and operational metrics"
          icon={Sparkles}
          actions={
            <>
              <Button variant="outline" size="sm" className="gap-2">
                <Calendar className="w-4 h-4" /> Last 30 days
              </Button>
              <Button variant="gold" size="sm" className="gap-2">
                <Download className="w-4 h-4" /> Export Report
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Network Volume (30d)"
            value={
              <span className="text-base sm:text-lg leading-tight block">
                {isLoading ? "…" : volumeSummary}
              </span>
            }
            icon={TrendingUp}
          />
          <KpiCard label="Active Holders" value={isLoading ? "…" : fmtN(data?.holdersCount ?? 0)} icon={Users} />
          <KpiCard label="Approved Transactions" value={isLoading ? "…" : fmtN(data?.posted ?? 0)} icon={BarChart3} />
          <KpiCard
            label="Rejection Rate"
            value={isLoading ? "…" : `${(data?.rejectionRate ?? 0).toFixed(1)}%`}
            icon={PieIcon}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PremiumCard variant="premium" className="lg:col-span-2 p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-serif font-semibold text-foreground">Daily Transactions</h2>
                <p className="text-sm text-text-secondary mt-0.5">Volume over the last 7 days</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="w-2 h-2 rounded-full bg-gold" /> Volume
              </span>
            </div>
            <div className="h-64" style={{ minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                <AreaChart data={data?.dailyVolume ?? []}>
                  <defs>
                    <linearGradient id="rGold" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D4A857" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#D4A857" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="d" axisLine={false} tickLine={false} tick={axisTick} />
                  <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="v" stroke="#D4A857" strokeWidth={2} fill="url(#rGold)" />
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
                  <Pie
                    data={data?.currencyDistribution ?? []}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="#161B22"
                    strokeWidth={2}
                  >
                    {(data?.currencyDistribution ?? []).map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PremiumCard className="lg:col-span-2 p-6">
            <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Customer Growth</h2>
            <p className="text-sm text-text-secondary mb-6">New onboarded customers per month</p>
            <div className="h-56" style={{ minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <BarChart data={data?.customerGrowth ?? []}>
                  <XAxis dataKey="m" axisLine={false} tickLine={false} tick={axisTick} />
                  <YAxis axisLine={false} tickLine={false} tick={axisTick} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="v" fill="#D4A857" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PremiumCard>

          <PremiumCard variant="premium" className="p-6">
            <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Top Accounts</h2>
            <p className="text-sm text-text-secondary mb-5">Highest balance holders</p>
            {(!topAccounts || topAccounts.length === 0) ? (
              <p className="text-xs text-text-tertiary">No accounts yet.</p>
            ) : (
              <ul className="space-y-3">
                {topAccounts.map((a: any, i) => (
                  <li
                    key={`${a.account_id}-${a.currency}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-[oklch(from_var(--surface-2)_l_c_h/0.3)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-[oklch(from_var(--gold)_l_c_h/0.15)] text-gold text-[11px] font-semibold inline-flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {a.accounts?.name ?? "—"}
                        </p>
                        <CurrencyBadge currency={a.currency} />
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

        <PremiumCard className="p-6">
          <h2 className="text-lg font-serif font-semibold text-foreground mb-4">Saved Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              "Monthly Compliance Summary",
              "High-Value Transaction Audit",
              "Currency Position Report",
              "Vault Balance Report",
              "Teller Activity Report",
              "Pending Approvals Report",
              "Holder Account Summary",
              "Audit Log Export",
            ].map((r) => (
              <button
                key={r}
                disabled
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-[oklch(from_var(--surface-2)_l_c_h/0.3)] hover:border-[oklch(from_var(--gold)_l_c_h/0.30)] hover:bg-[oklch(from_var(--gold)_l_c_h/0.05)] transition-all text-left group disabled:opacity-60 disabled:cursor-not-allowed"
              >
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
          <Link to="/app/transactions" className="text-gold hover:text-gold-soft">
            Browse transactions
          </Link>{" "}
          or{" "}
          <Link to="/app/audit" className="text-gold hover:text-gold-soft">
            view the audit log
          </Link>
          .
        </p>
      </div>
    </>
  );
}