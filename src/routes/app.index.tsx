import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PremiumCard } from "@/components/ui/premium-card";
import { formatMinor, formatDateTime } from "@/lib/format";
import { formatMinorOrMissing } from "@/lib/format";
import {
  TrendingUp, Users, ShieldCheck, ArrowDownRight, ArrowUpRight,
  Landmark, Wallet, Settings, Star, Plus, X, Search, ChevronRight,
  Clock, UserPlus, FileSearch, Eye, Download, ShieldAlert, CheckCircle2,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { DATA_BACKEND, REALTIME_MODE, POLL_INTERVALS } from "@/lib/runtimeConfig";
import { useDashboardSummary, fmtTotal } from "@/lib/useDashboardSummary";
import { BackendPending } from "@/components/app/backend-pending";
import { useShowMasterTools } from "@/lib/admin-mode";

export const Route = createFileRoute("/app/")({ head: () => ({ meta: [{ title: "Back-office dashboard — Dahab" }, { name: "description", content: "Daily Dahab dashboard with vault balances, pending approvals, and activity." }] }), component: Dashboard });

const CURRENCIES = ["USD", "EUR", "LYD"] as const;
type Currency = (typeof CURRENCIES)[number];

type DashPrefs = {
  showCurrencies: Record<Currency, boolean>;
  showCash: boolean;
  showBank: boolean;
  showRecent: boolean;
  showPinnedCustomers: boolean;
  showHoldings: boolean;
  pinnedAccountIds: string[];
};

const DEFAULT_PREFS: DashPrefs = {
  showCurrencies: { USD: true, EUR: true, LYD: true },
  showCash: true,
  showBank: true,
  showRecent: true,
  showPinnedCustomers: true,
  showHoldings: true,
  pinnedAccountIds: [],
};

function usePrefs() {
  const { user } = useAuth();
  const key = user ? `dahab.dash.prefs:${user.id}` : null;
  const [prefs, setPrefs] = useState<DashPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {}
  }, [key]);
  const update = (next: DashPrefs) => {
    setPrefs(next);
    if (key) try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  };
  return { prefs, update };
}

// ─── Shared dashboard data hook ──────────────────────────────────────────────
function useDashData() {
  return useQuery({
    queryKey: ["dashboard.v3"],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        // Lambda mode: read everything from the AWS API. We only synthesize
        // the legacy {accounts, balances} shape from /api/vaults so existing
        // computations keep working. No Supabase, no mock fallback.
        const [adminRes, vaultsRes, recentRes] = await Promise.all([
          api.dashboard.admin().catch(() => null),
          api.vaults.list().catch(() => [] as any[]),
          api.transactions.list({ limit: 8 }).catch(() => [] as any[]),
        ]);
        const accounts = (vaultsRes ?? []).map((v: any) => ({
          id: v.id,
          kind: "vault" as const,
          name: v.name,
          // Heuristic: mark all backend-returned vaults as cash unless API
          // exposes a channel field. UI shows 0 in any unmapped channel.
          vault_channel: (v.vault_channel ?? v.channel ?? "cash") as string,
        }));
        const balances = (vaultsRes ?? []).flatMap((v: any) =>
          v.current_balance != null && v.currency_code
            ? [{
                account_id: v.id,
                currency: v.currency_code,
                balance_minor: Number(v.current_balance) || 0,
              }]
            : [],
        );
        const recentTx = (recentRes ?? []).map((r: any) => ({
          id: String(r.id),
          tx_number: r.tx_number,
          direction: r.direction,
          channel: r.channel ?? "cash",
          currency: r.currency ?? r.currency_code,
          amount_minor: Number(r.amount_minor ?? 0),
          status: r.status,
          created_at: r.created_at ?? r.posted_at,
          comment: r.comment ?? r.description ?? "",
          customer_account_id: String(r.customer_account_id ?? ""),
          holder_name: r.holder_name ?? null,
          account_number: r.account_number ?? r.dahab_account_number ?? null,
        }));
        return {
          accounts,
          balances,
          recentTx,
          pendingCount: Number((adminRes as any)?.pending_approvals ?? 0),
          holderCount: Number(
            (adminRes as any)?.holder_count ?? (adminRes as any)?.active_holders ?? 0,
          ),
          cashByCurrency: ((adminRes as any)?.cash_by_currency ?? []) as Array<{
            currency: string;
            net_balance_minor: number;
          }>,
          bankByCurrency: ((adminRes as any)?.bank_by_currency ?? null) as Array<{
            currency: string;
            net_balance_minor: number;
          }> | null,
          bankSplitAvailable: Boolean((adminRes as any)?.bank_split_available),
          holderBalancesByCurrency:
            ((adminRes as any)?.holder_balances_by_currency ?? null) as Array<{
              currency: string;
              balance_minor: number;
              account_count: number | null;
              holder_count: number | null;
            }> | null,
        };
      }
      const [accounts, balances, recentTx, pending, holders] = await Promise.all([
        supabase.from("accounts").select("id, kind, name, vault_channel"),
        supabase.from("account_balances").select("account_id, currency, balance_minor"),
        supabase
          .from("transactions")
          .select("id, tx_number, direction, channel, currency, amount_minor, status, created_at, comment, customer_account_id")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("account_holders").select("id", { count: "exact", head: true }),
      ]);
      return {
        accounts: accounts.data ?? [],
        balances: balances.data ?? [],
        recentTx: recentTx.data ?? [],
        pendingCount: pending.count ?? 0,
        holderCount: holders.count ?? 0,
        cashByCurrency: [] as Array<{ currency: string; net_balance_minor: number }>,
        bankByCurrency: null as Array<{ currency: string; net_balance_minor: number }> | null,
        bankSplitAvailable: false,
        holderBalancesByCurrency: null as Array<{
          currency: string;
          balance_minor: number;
          account_count: number | null;
          holder_count: number | null;
        }> | null,
      };
    },
    refetchInterval: REALTIME_MODE === "polling" ? POLL_INTERVALS.dashboard : false,
  });
}

function useTotals(data: ReturnType<typeof useDashData>["data"]) {
  return useMemo(() => {
    const cashByCur = new Map<string, number>();
    const bankByCur = new Map<string, number>();
    const customerByCur = new Map<string, number>();
    if (data) {
      const accById = new Map(data.accounts.map((a) => [a.id, a]));
      for (const b of data.balances) {
        const acc = accById.get(b.account_id);
        if (!acc) continue;
        if (acc.kind === "vault") {
          if (acc.vault_channel === "cash") cashByCur.set(b.currency, (cashByCur.get(b.currency) ?? 0) + b.balance_minor);
          else if (acc.vault_channel === "bank") bankByCur.set(b.currency, (bankByCur.get(b.currency) ?? 0) + b.balance_minor);
        } else {
          customerByCur.set(b.currency, (customerByCur.get(b.currency) ?? 0) + b.balance_minor);
        }
      }
    }
    return { cashByCur, bankByCur, customerByCur };
  }, [data]);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
function Dashboard() {
  const { prefs, update } = usePrefs();
  const roles = useEffectiveRoles();
  const showMasterTools = useShowMasterTools();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const isAuditor = hasAnyRole(roles, ["auditor"]) && !isAdmin;
  const isTeller = hasAnyRole(roles, ["teller"]) && !isAdmin && !isAuditor;
  const t = useT();
  const roleLabel = showMasterTools
    ? (t("usersNew.role.admin") + (t("usersNew.role.admin") === "Admin" ? " (Master)" : ""))
    : isAdmin ? t("usersNew.role.admin")
    : isAuditor ? t("usersNew.role.auditor")
    : isTeller ? t("usersNew.role.teller")
    : (t("nav.dashboard"));
  const accent = isAuditor ? "sky" : "gold";

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:px-8 lg:pt-4 lg:pb-12 lg:space-y-5 lg:max-w-7xl lg:mx-auto">
      {/* Header greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl lg:text-[26px] font-semibold tracking-tight text-foreground">
              {greeting()}, {roleLabel}
            </h1>
            <span
              className={cn(
                "px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-[0.18em] font-bold border",
                accent === "sky"
                  ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                  : "bg-gold/10 text-gold border-gold/30"
              )}
            >
              {roleLabel}
            </span>
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
            }).format(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isAdmin ? <PendingApprovalsButton /> : null}
          <CustomizeSheet prefs={prefs} onChange={update} />
        </div>
      </div>

      {isAdmin && <AdminDashboard prefs={prefs} update={update} />}
      {isTeller && <TellerDashboard prefs={prefs} />}
      {isAuditor && <AuditorDashboard prefs={prefs} />}
      {!isAdmin && !isTeller && !isAuditor && <AdminDashboard prefs={prefs} update={update} />}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (typeof document !== "undefined" && document.documentElement.lang === "ar") {
    if (h < 12) return "صباح الخير";
    if (h < 18) return "مساء الخير";
    return "مساء الخير";
  }
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function PendingApprovalsButton() {
  const { data } = useQuery({
    queryKey: ["dash.pending.count"],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const r = await api.dashboard.admin().catch(() => null);
        return Number((r as any)?.pending_approvals ?? 0);
      }
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    refetchInterval: REALTIME_MODE === "polling" ? POLL_INTERVALS.dashboard : false,
  });
  if (!data) return null;
  return (
    <Button asChild variant="outline" className="border-gold/40 text-gold hover:bg-gold/10 shadow-[0_0_15px_rgba(212,168,87,0.1)]">
      <Link to="/app/approvals" className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" /> Pending Approvals
        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-gold text-[#14181F] px-1.5 py-0.5 text-xs font-bold">
          {data}
        </span>
      </Link>
    </Button>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
function AdminDashboard({ prefs, update }: { prefs: DashPrefs; update: (p: DashPrefs) => void }) {
  const t = useT();
  const { data, isLoading } = useDashData();
  const totals = useTotals(data);
  const { data: dashSummary } = useDashboardSummary();
  const isLambda = DATA_BACKEND === "lambda";
  const showMasterTools = useShowMasterTools();

  // Source-of-truth currency cash vault balances (net of receivable+payable
  // per currency). Backend already returns the net — never sum or subtract
  // again on the client.
  const cashByCurBackend = new Map<string, number>(
    (data?.cashByCurrency ?? []).map((r) => [r.currency, Number(r.net_balance_minor) || 0]),
  );
  const bankByCurBackend = data?.bankByCurrency
    ? new Map<string, number>(
        data.bankByCurrency.map((r) => [r.currency, Number(r.net_balance_minor) || 0]),
      )
    : null;
  const cashSource = isLambda ? cashByCurBackend : totals.cashByCur;
  const bankSource = isLambda
    ? bankByCurBackend // null means split not available
    : totals.bankByCur;
  const hasCashSource = isLambda ? data?.cashByCurrency != null && data.cashByCurrency.length > 0 : true;

  // Network total expressed in LYD-equivalent. Frontend MUST NOT compute FX
  // — the backend report applies admin-entered fx_rates and returns either a
  // single LYD-minor total or the list of missing rate pairs. See
  // src/lib/api/reports.ts → liquidityHealth().
  const liquidity = useQuery({
    queryKey: ["reports", "liquidity-health"],
    queryFn: () => api.reports.liquidityHealth(),
    retry: false,
    enabled: DATA_BACKEND === "lambda",
    refetchInterval: REALTIME_MODE === "polling" ? POLL_INTERVALS.reports : false,
  });
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[dashboard liquidity health raw]", liquidity.data);
    // eslint-disable-next-line no-console
    console.log("[dashboard liquidity health status]", {
      isLoading: liquidity.isLoading,
      isError: liquidity.isError,
      error: liquidity.error,
    });
  }
  const networkLyd = liquidity.data?.network_total_lyd_minor ?? null;
  const networkUsd = liquidity.data?.network_total_usd_minor ?? null;
  const missingRates = Array.isArray(liquidity.data?.missing_rates)
    ? liquidity.data!.missing_rates
    : [];
  const hasConsolidatedTotal = networkLyd != null || networkUsd != null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      {/* Hero — Network Pulse */}
      <PremiumCard className="p-6 lg:p-5 relative overflow-hidden border-gold/20 shadow-[0_0_40px_rgba(212,168,87,0.08)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gold/15 via-transparent to-transparent opacity-80 pointer-events-none" />
        <HeroGridOverlay />
        <div className="relative z-10 flex flex-col lg:flex-row lg:gap-6 gap-8 lg:items-center justify-between">
          <div className="flex-1 lg:basis-5/12">
            <div className="flex items-center gap-2 mb-3">
              <LivePulse />
              <span className="text-[10px] tracking-[0.2em] uppercase text-gold font-semibold">{t("dash.networkPulse")}</span>
            </div>
            <div className="text-sm text-muted-foreground mb-1">{t("dash.totalConsolidated")}</div>
            <div className="font-serif text-4xl sm:text-5xl lg:text-4xl xl:text-[44px] font-bold text-foreground tabular-nums tracking-tight">
              {hasConsolidatedTotal ? (
                networkLyd != null ? (
                  <AnimatedNumber value={networkLyd} currency="LYD" />
                ) : (
                  <AnimatedNumber value={networkUsd as number} currency="USD" />
                )
              ) : (
                <span className="text-muted-foreground text-2xl">
                  {liquidity.isLoading ? "…" : "FX/consolidated total pending"}
                </span>
              )}
            </div>
            {hasConsolidatedTotal && networkUsd != null && networkLyd != null && (
              <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                ≈ {formatMinor(networkUsd, "USD")} USD
              </div>
            )}
            {missingRates.length > 0 && (
              <div className="text-xs text-amber-400 mt-1">
                Missing FX rates for: {missingRates
                  .map((r: any) => (typeof r === "string" ? r : `${r.from}→${r.to}`))
                  .join(", ")}
              </div>
            )}
            {showMasterTools && (
              <div className="mt-2 rounded border border-dashed border-border/60 bg-surface-2/40 p-2 text-[10px] font-mono text-muted-foreground space-y-0.5">
                <div>Liquidity consolidated debug:</div>
                <div>network_total_lyd_minor: {String(networkLyd)}</div>
                <div>network_total_usd_minor: {String(networkUsd)}</div>
                <div>missing_rates: {JSON.stringify(missingRates)}</div>
                <div>hasConsolidatedTotal: {String(hasConsolidatedTotal)}</div>
              </div>
            )}
          </div>
          <div className="flex-1 lg:basis-7/12 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {CURRENCIES.filter((c) => prefs.showCurrencies[c]).map((c) => {
              const cashAmt = cashSource?.get(c) ?? 0;
              const bankAmt = bankSource?.get(c) ?? 0;
              // When bank split is unavailable, show the currency cash vault
              // net balance only — never fabricate a combined cash+bank.
              const amt = bankSource ? cashAmt + bankAmt : cashAmt;
              const seed = c === "LYD" ? [30, 35, 40, 45, 60, 75, 80] : c === "USD" ? [40, 45, 42, 50, 48, 55, 60] : [60, 58, 55, 52, 54, 50, 48];
              const trendUp = seed[seed.length - 1] >= seed[0];
              return (
                <div key={c} className="bg-surface-2/60 backdrop-blur-md border border-border/50 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <CurrencyBadge currency={c} />
                    <span className={cn("text-xs font-medium", trendUp ? "text-emerald-400" : "text-red-400")}>
                      {trendUp ? "+" : ""}{((seed[seed.length - 1] - seed[0]) / Math.max(seed[0], 1) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-base font-semibold text-foreground tabular-nums mb-2 truncate">
                    {formatMinorOrMissing(amt, c)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    {c} currency cash vault
                  </div>
                  <Sparkline data={seed} color={trendUp ? "#34d399" : "#f87171"} />
                </div>
              );
            })}
          </div>
        </div>
      </PremiumCard>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "New Deposit", icon: ArrowDownRight, to: "/app/transactions/new/deposit" },
          { label: "New Withdraw", icon: ArrowUpRight, to: "/app/transactions/new/withdraw" },
          { label: "New Customer", icon: UserPlus, to: "/app/users/new-consumer" },
        ].map((a) => (
          <Link key={a.label} to={a.to} className="block group">
            <PremiumCard className="p-4 lg:p-3 flex flex-col items-center justify-center gap-3 lg:flex-row lg:justify-start lg:gap-3 hover:-translate-y-0.5 hover:border-gold/40 hover:bg-surface-2/50 transition-all cursor-pointer">
              <div className="w-10 h-10 lg:w-9 lg:h-9 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <a.icon className="w-5 h-5 lg:w-4 lg:h-4 text-gold" />
              </div>
              <span className="text-sm font-semibold text-foreground">{a.label}</span>
            </PremiumCard>
          </Link>
        ))}
      </div>

      {/* DAHABDB totals strip — sourced from /dashboard/staff summary, never
          from limited list endpoints. Renders "—" when a field is missing. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Holders", value: dashSummary?.holderCount, to: "/app/holders" as const },
          { label: "Linked accounts", value: dashSummary?.holderAccountCount, to: "/app/holders" as const },
          { label: "Transactions", value: dashSummary?.transactionCount, to: "/app/transactions" as const },
          { label: "Vaults", value: dashSummary?.vaultCount, to: "/app/vaults" as const },
        ].map((k) => (
          <Link key={k.label} to={k.to} className="block">
            <PremiumCard className="p-4 hover:border-gold/40 transition-colors">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {k.label}
              </div>
              <div className="font-serif text-2xl font-bold text-foreground tabular-nums">
                {fmtTotal(k.value ?? null)}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">{t("dash.dahabdbTotal")}</div>
            </PremiumCard>
          </Link>
        ))}
      </div>

      {/* Body: flat 12-col grid on lg+. On mobile it's a single column with the
          existing source order preserved. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-5">
        {/* Vaults — full width on desktop */}
        {(prefs.showCash || prefs.showBank) && (
          <div className="lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {prefs.showCash && (isLambda && !hasCashSource ? (
              <BackendPending
                endpoint="GET /dashboard/staff (summary.cash_by_currency)"
                note="Currency cash vault totals will populate once summary.cash_by_currency is returned."
              />
            ) : (
              <VaultGaugeCard
                icon={<Wallet className="w-32 h-32 lg:w-24 lg:h-24 text-gold" />}
                title={t("dash.cashVaults")}
                percent={vaultUtilization(cashSource ?? new Map())}
                rows={CURRENCIES.filter((c) => prefs.showCurrencies[c]).map((c) => ({
                  label: `${c} currency cash vault`,
                  value: formatMinorOrMissing(cashSource?.get(c) ?? 0, c),
                }))}
              />
            ))}
            {prefs.showBank && (isLambda && !bankSource ? (
              <BackendPending
                endpoint="GET /dashboard/staff (summary.bank_by_currency)"
                note="Cash vs bank split is not yet returned by the backend. Bank vault totals will populate once summary.bank_by_currency is exposed (bank_split_available=true). No fabricated zeros are shown."
              />
            ) : (
              <VaultGaugeCard
                icon={<Landmark className="w-32 h-32 lg:w-24 lg:h-24 text-gold" />}
                title={t("dash.bankVaults")}
                percent={vaultUtilization(bankSource ?? new Map())}
                rows={CURRENCIES.filter((c) => prefs.showCurrencies[c]).map((c) => ({
                  label: c, value: formatMinorOrMissing(bankSource?.get(c) ?? 0, c),
                }))}
              />
            ))}
          </div>
        )}

        {/* Pinned Customers — full width on desktop, directly under vaults */}
        {prefs.showPinnedCustomers && (
          <div className="lg:col-span-12">
            <PinnedCustomers
              ids={prefs.pinnedAccountIds}
              onUnpin={(id) =>
                update({ ...prefs, pinnedAccountIds: prefs.pinnedAccountIds.filter((x) => x !== id) })
              }
            />
          </div>
        )}

        {/* Holdings (desktop position) */}
        {prefs.showHoldings && data && (
          <div className="hidden lg:block lg:col-span-7">
            <HoldingsSummary
              holderCount={data.holderCount}
              customerByCur={totals.customerByCur}
              holderBalancesByCurrency={data.holderBalancesByCurrency}
            />
          </div>
        )}

        {/* Urgent approvals — right side on desktop */}
        <div className="lg:col-span-5">
          <UrgentApprovals />
        </div>

        {/* Holdings (mobile/tablet position) */}
        {prefs.showHoldings && data && (
          <div className="lg:hidden">
            <HoldingsSummary
              holderCount={data.holderCount}
              customerByCur={totals.customerByCur}
              holderBalancesByCurrency={data.holderBalancesByCurrency}
            />
          </div>
        )}
      </div>

      {prefs.showRecent && <RecentTransactionsTable rows={data?.recentTx ?? []} loading={isLoading} />}
    </div>
  );
}

// ─── TELLER DASHBOARD ────────────────────────────────────────────────────────
function TellerDashboard({ prefs }: { prefs: DashPrefs }) {
  const t = useT();
  const { data, isLoading } = useDashData();
  const { data: dashSummary } = useDashboardSummary();
  // Source-of-truth: summary.txns_today from /dashboard/staff. Never count
  // loaded recent rows as a global total.
  const todayCount = dashSummary?.txnsToday ?? null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <PremiumCard className="p-6 relative overflow-hidden border-gold/20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gold/10 via-transparent to-transparent opacity-80 pointer-events-none" />
        <HeroGridOverlay />
        <div className="relative z-10 flex flex-col md:flex-row gap-8 md:items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <LivePulse />
              <span className="text-[10px] tracking-[0.2em] uppercase text-gold font-semibold">Today's Shift</span>
            </div>
            <div className="text-sm text-muted-foreground mb-1">{t("dash.txProcessed")}</div>
            <div className="font-serif text-4xl sm:text-5xl font-bold text-foreground tabular-nums tracking-tight">
              {todayCount === null ? (
                <span className="text-muted-foreground text-2xl">—</span>
              ) : (
                <AnimatedNumber value={todayCount} />
              )}
            </div>
          </div>
          <div className="flex gap-4">
            <ShiftStat label="Pending" value={String(data?.pendingCount ?? 0)} />
            <ShiftStat label="Avg Time" value="3m 12s" />
          </div>
        </div>
      </PremiumCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "New Deposit", icon: ArrowDownRight, to: "/app/transactions/new/deposit" },
          { label: "New Withdraw", icon: ArrowUpRight, to: "/app/transactions/new/withdraw" },
          { label: "Find Customer", icon: FileSearch, to: "/app/holders" },
        ].map((a) => (
          <Link key={a.label} to={a.to} className="block group">
            <PremiumCard className="p-4 flex items-center gap-4 hover:-translate-y-0.5 hover:border-gold/40 transition-all">
              <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <a.icon className="w-5 h-5 text-gold" />
              </div>
              <span className="text-sm font-semibold text-foreground">{a.label}</span>
            </PremiumCard>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><UrgentApprovals title={t("dash.myQueue")} /></div>
        <div>
          <PremiumCard className="p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-4">{t("dash.opStatus")}</h3>
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("dash.branchStatus")}</span>
                <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Open
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("dash.shiftStarted")}</span>
                <span className="text-foreground tabular-nums">08:00 AM</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("dash.terminalId")}</span>
                <span className="text-foreground font-mono bg-surface-2 px-2 py-0.5 rounded">TRM-04</span>
              </div>
            </div>
          </PremiumCard>
        </div>
      </div>

      {prefs.showRecent && <RecentTransactionsTable rows={data?.recentTx ?? []} loading={isLoading} />}
    </div>
  );
}

// ─── AUDITOR DASHBOARD ───────────────────────────────────────────────────────
function AuditorDashboard({ prefs }: { prefs: DashPrefs }) {
  const t = useT();
  const { data, isLoading } = useDashData();
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <PremiumCard className="p-6 relative overflow-hidden border-sky-500/20 shadow-[0_0_40px_rgba(56,189,248,0.05)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sky-500/10 via-transparent to-transparent opacity-80 pointer-events-none" />
        <HeroGridOverlay color="#38bdf8" />
        <div className="relative z-10 flex flex-col md:flex-row gap-8 md:items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
              </span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-sky-400 font-semibold">{t("dash.integrityPulse")}</span>
            </div>
            <div className="text-sm text-muted-foreground mb-1">Anomalies Detected (24h)</div>
            <div className="font-serif text-4xl sm:text-5xl font-bold text-foreground tabular-nums tracking-tight">
              <AnimatedNumber value={3} />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <RadialGauge percentage={95} colorClass="stroke-sky-400" />
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("dash.systemIntegrity")}</div>
              <div className="text-sm text-foreground">Last full audit: <span className="tabular-nums">Today, 04:00 AM</span></div>
            </div>
          </div>
        </div>
      </PremiumCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "View Audit Trail", icon: FileSearch, to: "/app/audit" },
          { label: "Export Report", icon: Download, to: "/app/reports" },
          { label: "View Reports", icon: Eye, to: "/app/reports" },
        ].map((a) => (
          <Link key={a.label} to={a.to} className="block group">
            <PremiumCard className="p-4 flex items-center gap-4 hover:-translate-y-0.5 hover:border-sky-500/40 transition-all">
              <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <a.icon className="w-5 h-5 text-sky-400" />
              </div>
              <span className="text-sm font-semibold text-foreground">{a.label}</span>
            </PremiumCard>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><RecentAuditEvents /></div>
        <div><AnomalyWatchlist /></div>
      </div>

      {prefs.showRecent && <RecentTransactionsTable rows={data?.recentTx ?? []} loading={isLoading} redacted />}
    </div>
  );
}

// ─── REUSABLE PIECES ─────────────────────────────────────────────────────────
function ShiftStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2/60 backdrop-blur-md border border-border/50 rounded-xl p-4 min-w-[120px]">
      <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function vaultUtilization(byCur: Map<string, number>) {
  const total = Array.from(byCur.values()).reduce((s, n) => s + n, 0);
  if (total === 0) return 0;
  // Decorative: cap at 95
  return Math.min(95, Math.round(Math.log10(total + 10) * 12));
}

function VaultGaugeCard({ icon, title, percent, rows }: { icon: React.ReactNode; title: string; percent: number; rows: { label: string; value: string }[] }) {
  return (
    <PremiumCard className="p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-[0.06] pointer-events-none">{icon}</div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-6 relative z-10">{title}</h3>
      <div className="flex items-center gap-6 relative z-10">
        <RadialGauge percentage={percent} colorClass="stroke-gold" />
        <div className="space-y-2 flex-1 min-w-0">
          {rows.map((r, i) => (
            <div key={r.label} className={cn("flex justify-between items-center", i < rows.length - 1 && "border-b border-border/50 pb-2")}>
              <span className="text-sm text-muted-foreground">{r.label}</span>
              <span className="font-medium text-foreground tabular-nums text-sm truncate ml-2">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </PremiumCard>
  );
}

function UrgentApprovals({ title = "Urgent Approvals" }: { title?: string }) {
  const { data } = useQuery({
    queryKey: ["dash.urgent.approvals"],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const res = await api.approvals.pendingPaged({ limit: 4 }).catch(() => null);
        return (res?.items ?? []).map((r: any) => ({
          id: String(r.id),
          tx_number: r.tx_number,
          direction: r.direction,
          currency: r.currency ?? r.currency_code,
          amount_minor: Number(r.amount_minor ?? 0),
          created_at: r.created_at ?? r.posted_at,
        }));
      }
      const { data } = await supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, created_at, comment")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(4);
      return data ?? [];
    },
  });
  return (
    <PremiumCard className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex justify-between items-center bg-surface-2/30">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.18em] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-gold" /> {title}
        </h3>
        <Link to="/app/approvals" className="text-xs text-gold hover:text-gold-soft">View Queue →</Link>
      </div>
      <div className="divide-y divide-border">
        {(data ?? []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No items in the queue.</div>
        ) : (
          (data ?? []).map((tx) => {
            const ageMin = Math.max(0, Math.round((Date.now() - new Date(tx.created_at).getTime()) / 60000));
            const urgent = ageMin > 60;
            return (
              <Link key={tx.id} to="/app/approvals" className="flex items-center justify-between p-4 hover:bg-surface-2/50 transition-colors group">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("w-2 h-2 rounded-full", urgent ? "bg-red-500 animate-pulse" : "bg-amber-500")} />
                    <span className="text-sm font-semibold text-foreground group-hover:text-gold transition-colors capitalize">{tx.direction}</span>
                    <span className="text-[10px] text-muted-foreground">{ageMin}m ago</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {tx.tx_number} • {formatMinorOrMissing(tx.amount_minor, tx.currency)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-gold group-hover:translate-x-1 transition-transform" />
              </Link>
            );
          })
        )}
      </div>
    </PremiumCard>
  );
}

function RecentAuditEvents() {
  const t = useT();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dash.recent.audit"],
    queryFn: async () => {
      const res = await api.audit.listPaged({ limit: 5 });
      return res.items ?? [];
    },
    retry: false,
    enabled: DATA_BACKEND === "lambda",
  });
  if (DATA_BACKEND !== "lambda") {
    return (
      <BackendPending
        endpoint="GET /audit"
        note="Recent audit events are sourced from the audit log endpoint."
      />
    );
  }
  if (error) {
    return (
      <BackendPending
        endpoint="GET /audit"
        note={(error as Error).message}
      />
    );
  }
  const events = (data ?? []).map((e: any, i: number) => ({
    id: e.id ?? i,
    action: e.action ?? e.event_type ?? "Audit event",
    user: e.actor_user_name ?? e.actor ?? e.actor_user_id ?? "system",
    details: e.summary ?? e.description ?? "",
    status:
      e.severity === "high" || e.status === "failed"
        ? "Failed"
        : e.severity === "warning"
        ? "Warning"
        : "Success",
    at: new Date(e.created_at ?? e.posted_at ?? Date.now()),
  }));
  return (
    <PremiumCard className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border bg-surface-2/30 flex justify-between items-center">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.18em]">{t("dash.recentAuditEvents")}</h3>
        <Link to="/app/audit" className="text-xs text-sky-400 hover:text-sky-300">{t("nav.audit")} →</Link>
      </div>
      <div className="divide-y divide-border">
        {isLoading && events.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">{t("common.loading")}</div>
        ) : events.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">{t("audit.empty")}</div>
        ) : null}
        {events.map((log) => (
          <div key={log.id} className="flex items-center justify-between p-4 hover:bg-surface-2/50 transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={cn("w-2 h-2 rounded-full",
                  log.status === "Success" ? "bg-emerald-400" : log.status === "Warning" ? "bg-amber-400" : "bg-red-500"
                )} />
                <span className="text-sm font-semibold text-foreground">{log.action}</span>
                <span className="text-xs text-muted-foreground font-mono bg-surface-2 px-1.5 py-0.5 rounded">{log.user}</span>
              </div>
              <div className="text-xs text-muted-foreground">{log.details}</div>
            </div>
            <div className="text-[10px] text-muted-foreground">{formatDateTime(log.at.toISOString())}</div>
          </div>
        ))}
      </div>
    </PremiumCard>
  );
}

function AnomalyWatchlist() {
  // No backend endpoint for anomaly detection yet — render a backend-pending
  // card instead of fabricating items.
  return (
    <BackendPending
      endpoint="GET /reports/anomalies (proposed)"
      note="Anomaly watchlist will populate once the backend exposes an anomaly detection endpoint."
    />
  );
}

function HoldingsSummary({
  holderCount,
  customerByCur,
  holderBalancesByCurrency,
}: {
  holderCount: number;
  customerByCur: Map<string, number>;
  holderBalancesByCurrency:
    | Array<{ currency: string; balance_minor: number; account_count: number | null; holder_count: number | null }>
    | null;
}) {
  // Source of truth for per-currency holder balances:
  //   summary.holder_balances_by_currency from /dashboard/staff.
  // Never derive from cash_by_currency or bank_by_currency. In Supabase
  // fallback mode we keep the legacy customerByCur map.
  const lambda = DATA_BACKEND === "lambda";
  // Build rows directly from backend payload so any currency the backend
  // returns (incl. GBP) is shown — no hard-coded currency list.
  const rows = useMemo(() => {
    if (holderBalancesByCurrency) {
      const order = ["LYD", "USD", "EUR", "GBP"];
      return [...holderBalancesByCurrency].sort(
        (a, b) => order.indexOf(a.currency) - order.indexOf(b.currency),
      );
    }
    if (!lambda) {
      return Array.from(customerByCur.entries()).map(([currency, balance_minor]) => ({
        currency,
        balance_minor,
        account_count: null as number | null,
        holder_count: null as number | null,
      }));
    }
    return null; // backend pending in lambda mode
  }, [holderBalancesByCurrency, customerByCur, lambda]);

  const t = useT();
  return (
    <PremiumCard className="p-5">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">{t("dash.holdingsSummary")}</h2>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
          <Users className="w-6 h-6 text-gold" />
        </div>
        <div>
          <div className="font-serif text-2xl font-bold text-foreground tabular-nums">{holderCount.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">{t("dash.totalActiveHolders")}</div>
        </div>
      </div>
      {rows === null ? (
        <BackendPending
          endpoint="GET /dashboard/staff → summary.holder_balances_by_currency"
          note="Per-currency holder account totals will appear once the backend exposes this field."
        />
      ) : (
      <div className="space-y-3">
        {(() => {
          const max = Math.max(...rows.map((r) => r.balance_minor), 1);
          return rows.map((r) => {
            const pct = Math.round((r.balance_minor / max) * 100);
            const counts: string[] = [];
            if (r.account_count != null) counts.push(`${r.account_count.toLocaleString()} accounts`);
            if (r.holder_count != null) counts.push(`${r.holder_count.toLocaleString()} holders`);
            return (
              <div key={r.currency}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">
                    {r.currency}
                    {counts.length > 0 && (
                      <span className="ml-2 text-[10px] text-muted-foreground/70">{counts.join(" · ")}</span>
                    )}
                  </span>
                  <span className="text-foreground font-medium tabular-nums">
                    {formatMinorOrMissing(r.balance_minor, r.currency)}
                  </span>
                </div>
                <div className="w-full bg-surface-2 rounded-full h-1.5">
                  <div className="bg-gradient-gold h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          });
        })()}
      </div>
      )}
    </PremiumCard>
  );
}

function RecentTransactionsTable({ rows, loading, redacted = false }: { rows: any[]; loading: boolean; redacted?: boolean }) {
  const t = useT();
  return (
    <PremiumCard className="overflow-hidden">
      <div className="p-4 border-b border-border bg-surface-2/30 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.18em]">{t("dash.recentTransactions")}</h2>
        <Link to="/app/transactions" className="text-xs text-gold hover:text-gold-soft font-medium">{t("nav.transactions")} →</Link>
      </div>
      <div className="overflow-x-auto lg:max-h-[420px] lg:overflow-y-auto">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">{t("dash.noTx")}</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] bg-surface-2/50 border-b border-border uppercase tracking-[0.14em] lg:sticky lg:top-0 lg:z-10">
              <tr>
                <th className="px-5 py-2.5 font-semibold text-muted-foreground">{t("dash.col.transaction")}</th>
                <th className="px-5 py-2.5 font-semibold text-muted-foreground hidden sm:table-cell">{t("dash.col.channel")}</th>
                <th className="px-5 py-2.5 font-semibold text-muted-foreground text-right">{t("dash.col.amount")}</th>
                <th className="px-5 py-2.5 font-semibold text-muted-foreground">{t("dash.col.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((tx) => {
                const isDeposit = tx.direction === "deposit";
                const isWithdraw = tx.direction === "withdraw";
                const cls = isDeposit ? "text-emerald-400" : isWithdraw ? "text-red-400" : "text-foreground";
                const sign = isDeposit ? "+" : isWithdraw ? "-" : "";
                return (
                  <tr key={tx.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-foreground capitalize text-sm">{tx.direction}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{tx.tx_number}</div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground capitalize hidden sm:table-cell">{tx.channel}</td>
                    <td className="px-5 py-3 text-right">
                      {redacted ? (
                        <Link to="/app/transactions" className="text-xs text-sky-400 hover:text-sky-300">View Record →</Link>
                      ) : (
                        <>
                          <span className={cn("font-semibold tabular-nums text-sm", cls)}>
                            {sign}{formatMinorOrMissing(tx.amount_minor, tx.currency)}
                          </span>
                          <div className="mt-0.5 flex justify-end"><CurrencyBadge currency={tx.currency} /></div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(tx.created_at)}</div>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={tx.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PremiumCard>
  );
}

// ─── Pinned customers + Customize sheet (kept from prior implementation) ────
function PinnedCustomers({ ids, onUnpin }: { ids: string[]; onUnpin: (id: string) => void }) {
  const t = useT();
  const isLambda = DATA_BACKEND === "lambda";
  const numericIds = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const sortedKey = ids.slice().sort().join(",");
  // Lambda-backed fetch — per-id holder + accounts lookup, parallelised.
  const lambdaQ = useQuery({
    queryKey: ["dash.pinned.holders.lambda", sortedKey],
    enabled: ids.length > 0 && isLambda,
    queryFn: async () => {
      const rows = await Promise.all(
        ids.map(async (id) => {
          const [h, accts] = await Promise.all([
            api.holders.get(id).catch(() => null),
            api.holders.accounts(id).catch(() => [] as any[]),
          ]);
          if (!h) return null;
          return {
            id: (h as any).id,
            canonical_name: (h as any).holder_name ?? (h as any).canonical_name,
            dahab_account_number: (h as any).dahab_account_number,
            holder_accounts: (accts as any[]).map((a) => ({
              id: a.id,
              currency_code: a.currency_code,
              current_balance: a.current_balance,
              account_display_name: a.account_display_name,
              account_nature: a.account_nature,
            })),
          };
        }),
      );
      return rows.filter(Boolean) as any[];
    },
  });
  const supaQ = useQuery({
    queryKey: ["dash.pinned.holders.v3", sortedKey],
    enabled: numericIds.length > 0 && !isLambda,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,status,holder_accounts(id,currency_code,current_balance,account_display_name,account_nature)")
        .in("id", numericIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const data = isLambda ? lambdaQ.data : supaQ.data;
  const isLoading = isLambda ? lambdaQ.isLoading : supaQ.isLoading;
  return (
    <PremiumCard className="p-5 border-gold/40 bg-[linear-gradient(135deg,oklch(0.74_0.135_82/0.10),transparent_60%)] shadow-[0_10px_40px_-20px_var(--gold)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-gold fill-gold" />
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gold">{t("dash.pinnedTitle")}</h2>
          <span className="chip chip-gold">{ids.length}</span>
        </div>
        <Users className="w-4 h-4 text-gold" />
      </div>
      {ids.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gold/30 bg-surface-2/50 p-4 text-center">
          <Star className="w-5 h-5 text-gold/60 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Pin customers via the Customize panel to see their accounts here.</p>
        </div>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {(data ?? []).map((h: any) => {
            const accounts = (h.holder_accounts ?? []) as any[];
            return (
              <div key={h.id} className="rounded-xl bg-surface-2 border border-gold/20 overflow-hidden hover:border-gold/40 transition-colors">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gold/10 bg-[linear-gradient(90deg,oklch(0.74_0.135_82/0.08),transparent)]">
                  <Link to="/app/holders/$id" params={{ id: String(h.id) }} className="min-w-0 flex-1 flex items-center gap-2 group">
                    <Star className="w-3.5 h-3.5 text-gold fill-gold shrink-0" />
                    <span className="font-semibold text-foreground text-sm truncate group-hover:text-gold transition-colors" dir="auto">
                      {h.canonical_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono truncate">{h.dahab_account_number}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); onUnpin(String(h.id)); }}
                    className="ml-2 p-1 rounded text-muted-foreground hover:text-gold transition"
                    aria-label="Unpin"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {accounts.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">{t("dash.noAccounts")}</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
                    {accounts.map((a: any) => (
                      <Link
                        key={a.id}
                        to="/app/accounts/$id"
                        params={{ id: String(a.id) }}
                        className="rounded-lg border border-border bg-card/60 p-2.5 hover:border-gold/40 hover:shadow-[0_4px_16px_-8px_var(--gold)] transition-all"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <CurrencyBadge currency={a.currency_code} />
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{a.account_nature}</span>
                        </div>
                        <div className="font-serif text-base text-gold tabular-nums num">
                          {Number(a.current_balance ?? 0).toLocaleString()}
                        </div>
                        {a.account_display_name && (
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5" dir="auto">
                            {a.account_display_name}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PremiumCard>
  );
}

function CustomizeSheet({ prefs, onChange }: { prefs: DashPrefs; onChange: (p: DashPrefs) => void }) {
  const t = useT();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="p-2.5 text-muted-foreground hover:text-gold transition-colors bg-surface-2 rounded-lg border border-border hover:border-gold/30" aria-label="Dashboard settings">
          <Settings className="w-5 h-5" />
        </button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif">{t("dash.settingsTitle")}</SheetTitle>
          <SheetDescription>{t("dash.subtitle")}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("dash.visibleCurrencies")}</div>
            <div className="space-y-2">
              {CURRENCIES.map((c) => (
                <div key={c} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-2.5">
                  <Label htmlFor={`cur-${c}`} className="flex items-center gap-2"><CurrencyBadge currency={c} /> <span>{c}</span></Label>
                  <Switch id={`cur-${c}`} checked={prefs.showCurrencies[c]} onCheckedChange={(v) => onChange({ ...prefs, showCurrencies: { ...prefs.showCurrencies, [c]: v } })} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("dash.widgets")}</div>
            <div className="space-y-2">
              <ToggleRow label="Cash Vaults" checked={prefs.showCash} onChange={(v) => onChange({ ...prefs, showCash: v })} />
              <ToggleRow label="Bank Vaults" checked={prefs.showBank} onChange={(v) => onChange({ ...prefs, showBank: v })} />
              <ToggleRow label="Recent Transactions" checked={prefs.showRecent} onChange={(v) => onChange({ ...prefs, showRecent: v })} />
              <ToggleRow label={t("dash.pinnedTitle")} checked={prefs.showPinnedCustomers} onChange={(v) => onChange({ ...prefs, showPinnedCustomers: v })} />
              <ToggleRow label={t("dash.holdingsSummary")} checked={prefs.showHoldings} onChange={(v) => onChange({ ...prefs, showHoldings: v })} />
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t("dash.pinnedTitle")}</div>
              <span className="text-[10px] text-muted-foreground">{prefs.pinnedAccountIds.length} pinned</span>
            </div>
            <PinAccountPicker
              pinned={prefs.pinnedAccountIds}
              onAdd={(id) => { if (!prefs.pinnedAccountIds.includes(id)) onChange({ ...prefs, pinnedAccountIds: [...prefs.pinnedAccountIds, id] }); }}
              onRemove={(id) => onChange({ ...prefs, pinnedAccountIds: prefs.pinnedAccountIds.filter((x) => x !== id) })}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-2.5">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function PinAccountPicker({ pinned, onAdd, onRemove }: { pinned: string[]; onAdd: (id: string) => void; onRemove: (id: string) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const isLambda = DATA_BACKEND === "lambda";
  const numericPinned = pinned.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  // Debounce search input so we don't hit the backend on every keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);
  const { data: results } = useQuery({
    queryKey: ["dash.pin.holders.search.v4", isLambda, debounced],
    queryFn: async () => {
      if (isLambda) {
        const list = await api.holders
          .list({ q: debounced || undefined, limit: 15 })
          .catch(() => [] as any[]);
        return (list as any[]).map((h) => ({
          id: String(h.id),
          name: h.holder_name ?? h.canonical_name,
          account_number: h.dahab_account_number,
        }));
      }
      const term = debounced;
      if (term) {
        const { data } = await supabase
          .from("account_holders")
          .select("id, dahab_account_number, canonical_name")
          .or(`dahab_account_number.ilike.%${term}%,canonical_name.ilike.%${term}%,normalized_name.ilike.%${term}%`)
          .limit(15);
        return (data ?? []).map((h: any) => ({ id: String(h.id), name: h.canonical_name, account_number: h.dahab_account_number }));
      }
      const { data } = await supabase
        .from("account_holders")
        .select("id, dahab_account_number, canonical_name")
        .order("created_at", { ascending: false })
        .limit(15);
      return (data ?? []).map((h: any) => ({ id: String(h.id), name: h.canonical_name, account_number: h.dahab_account_number }));
    },
  });
  const { data: pinnedRows } = useQuery({
    queryKey: ["dash.pin.holders.list.v4", isLambda, pinned.slice().sort().join(",")],
    enabled: pinned.length > 0,
    queryFn: async () => {
      if (isLambda) {
        const rows = await Promise.all(
          pinned.map((id) => api.holders.get(id).catch(() => null)),
        );
        return rows.filter(Boolean).map((h: any) => ({
          id: String(h.id),
          name: h.holder_name ?? h.canonical_name,
          account_number: h.dahab_account_number,
        }));
      }
      const { data } = await supabase
        .from("account_holders")
        .select("id, dahab_account_number, canonical_name")
        .in("id", numericPinned);
      return (data ?? []).map((h: any) => ({ id: String(h.id), name: h.canonical_name, account_number: h.dahab_account_number }));
    },
  });
  return (
    <div className="space-y-2">
      {pinnedRows && pinnedRows.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-border bg-surface-2 p-1.5">
          {pinnedRows.map((a: any) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{a.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{a.account_number}</div>
              </div>
              <button onClick={() => onRemove(a.id)} className="p-1 text-muted-foreground hover:text-red-400" aria-label="Remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-9 ps-7 text-xs" placeholder={t("dash.searchHolderPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-border bg-surface-2 p-1">
        {(results ?? []).filter((a: any) => !pinned.includes(a.id)).map((a: any) => (
          <li key={a.id}>
            <button type="button" onClick={() => onAdd(a.id)} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-start text-xs hover:bg-gold/10">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{a.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{a.account_number}</div>
              </div>
              <Plus className="h-3.5 w-3.5 text-gold" />
            </button>
          </li>
        ))}
        {results && results.length === 0 ? (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">{t("dash.noMatches")}</li>
        ) : null}
      </ul>
    </div>
  );
}

// ─── Visual primitives (mockup parity) ───────────────────────────────────────
function AnimatedNumber({ value, currency }: { value: number; currency?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = performance.now();
    const duration = 1500;
    let frame: number;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      setDisplay(value * ease);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  if (currency) return <>{formatMinor(display, currency)}</>;
  return <>{Math.floor(display).toLocaleString()}</>;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data); const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100, h = 30;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / range) * h}`).join(" ");
  const id = `grad-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M 0,${h} L ${pts} L ${w},${h} Z`} fill={`url(#${id})`} stroke="none" />
      <path d={`M ${pts}`} stroke={color} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RadialGauge({ percentage, size = 80, strokeWidth = 8, colorClass }: { percentage: number; size?: number; strokeWidth?: number; colorClass: string }) {
  const radius = (size - strokeWidth) / 2;
  const c = radius * 2 * Math.PI;
  const offset = c - (percentage / 100) * c;
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-surface-2" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} className={colorClass} strokeWidth={strokeWidth} fill="none" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-base font-bold tabular-nums text-foreground">{percentage}%</span>
      </div>
    </div>
  );
}

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-gold" />
    </span>
  );
}

function HeroGridOverlay({ color = "#D4A857" }: { color?: string }) {
  const id = `hero-grid-${color.replace("#", "")}`;
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke={color} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
