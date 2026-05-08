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

/**
 * Reports & Insights — admin/auditor analytics command center.
 * Visual scaffold matches the uploaded mockup. Data hooks for real
 * KPIs / charts are wired in follow-up edits; this page already uses
 * the production design tokens so the look is final.
 */

const dailyVolume = [
  { d: "Mon", v: 0 }, { d: "Tue", v: 0 }, { d: "Wed", v: 0 },
  { d: "Thu", v: 0 }, { d: "Fri", v: 0 }, { d: "Sat", v: 0 }, { d: "Sun", v: 0 },
];
const customerGrowth = [
  { m: "Jun", v: 0 }, { m: "Jul", v: 0 }, { m: "Aug", v: 0 },
  { m: "Sep", v: 0 }, { m: "Oct", v: 0 }, { m: "Nov", v: 0 }, { m: "Dec", v: 0 },
];
const currencyDistribution = [
  { name: "LYD", value: 0, color: "#D4A857" },
  { name: "USD", value: 0, color: "#E8C570" },
  { name: "EUR", value: 0, color: "#A8842F" },
  { name: "GBP", value: 0, color: "#F0D080" },
];

export const Route = createFileRoute("/app/reports")({
  component: () => (
    <RoleGate allow={["admin", "auditor"]}>
      <ReportsPage />
    </RoleGate>
  ),
  head: () => ({ meta: [{ title: "Reports & Insights — Dahab" }] }),
});

function ReportsPage() {
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
          <KpiCard label="Network Volume (30d)" value="—" icon={TrendingUp} />
          <KpiCard label="Active Holders" value="—" icon={Users} />
          <KpiCard label="Approved Transactions" value="—" icon={BarChart3} />
          <KpiCard label="Rejection Rate" value="—" icon={PieIcon} />
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
                <AreaChart data={dailyVolume}>
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
                    data={currencyDistribution}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="#161B22"
                    strokeWidth={2}
                  >
                    {currencyDistribution.map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-4">
              {currencyDistribution.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                    <CurrencyBadge currency={c.name} />
                  </div>
                  <span className="text-foreground font-medium tabular-nums">{c.value}%</span>
                </div>
              ))}
            </div>
          </PremiumCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PremiumCard className="lg:col-span-2 p-6">
            <h2 className="text-lg font-serif font-semibold text-foreground mb-1">Customer Growth</h2>
            <p className="text-sm text-text-secondary mb-6">New onboarded customers per month</p>
            <div className="h-56" style={{ minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <BarChart data={customerGrowth}>
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
            <p className="text-xs text-text-tertiary">Connect to live data — coming soon.</p>
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