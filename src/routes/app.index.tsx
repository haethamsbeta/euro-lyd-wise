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
import {
  TrendingUp, Users, ShieldCheck, ArrowDownRight, ArrowUpRight,
  Landmark, Wallet, Settings, Star, Plus, X, Search, ArrowRightLeft,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth, hasAnyRole } from "@/lib/auth";

export const Route = createFileRoute("/app/")({ component: Dashboard });

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

function Dashboard() {
  const t = useT();
  const { prefs, update } = usePrefs();
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const isStaff = hasAnyRole(roles, ["admin", "teller"]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.v2"],
    queryFn: async () => {
      const [accounts, balances, recentTx, pending, holders] = await Promise.all([
        supabase.from("accounts").select("id, kind, name, vault_channel"),
        supabase.from("account_balances").select("account_id, currency, balance_minor"),
        supabase
          .from("transactions")
          .select("id, tx_number, direction, channel, currency, amount_minor, status, created_at, comment, customer_account_id")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("account_holders").select("id", { count: "exact", head: true }),
      ]);
      return {
        accounts: accounts.data ?? [],
        balances: balances.data ?? [],
        recentTx: recentTx.data ?? [],
        pendingCount: pending.count ?? 0,
        holderCount: holders.count ?? 0,
      };
    },
  });

  // Aggregate per currency
  const totals = useMemo(() => {
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

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-foreground">{t("dash.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back. Here's what's happening across the DAHAB network today.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isAdmin && data && data.pendingCount > 0 ? (
            <Button asChild variant="outline" className="border-gold/40 text-gold hover:bg-gold/10">
              <Link to="/app/approvals" className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Pending Approvals
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-gold text-[#14181F] px-1.5 py-0.5 text-xs font-bold">
                  {data.pendingCount}
                </span>
              </Link>
            </Button>
          ) : null}
          <CustomizeSheet prefs={prefs} onChange={update} />
          {isStaff ? (
            <Button asChild variant="gold" size="sm">
              <Link to="/app/transactions/new" className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> New Transaction
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Currency Totals Strip — mockup parity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CURRENCIES.filter((c) => prefs.showCurrencies[c]).map((cur, i) => {
          const network = (totals.cashByCur.get(cur) ?? 0) + (totals.bankByCur.get(cur) ?? 0);
          return (
            <PremiumCard
              key={cur}
              variant="premium"
              className="p-6 group animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" } as React.CSSProperties}
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                <Landmark className="w-24 h-24 text-gold" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-gold-soft">
                    Network Balance
                  </span>
                  <CurrencyBadge currency={cur} />
                </div>
                <div className="font-serif text-3xl font-bold text-gold tabular-nums mb-2">
                  {formatMinor(network, cur)}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-gold/70" />
                  <span>Cash {formatMinor(totals.cashByCur.get(cur) ?? 0, cur)} · Bank {formatMinor(totals.bankByCur.get(cur) ?? 0, cur)}</span>
                </div>
              </div>
            </PremiumCard>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vaults Row */}
          {(prefs.showCash || prefs.showBank) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {prefs.showCash && (
                <VaultCard
                  icon={<Wallet className="w-5 h-5 text-gold" />}
                  title="Cash Vaults"
                  subtitle="Physical reserves"
                  rows={CURRENCIES.filter((c) => prefs.showCurrencies[c]).map((c) => ({
                    label: c, value: formatMinor(totals.cashByCur.get(c) ?? 0, c),
                  }))}
                />
              )}
              {prefs.showBank && (
                <VaultCard
                  icon={<Landmark className="w-5 h-5 text-gold" />}
                  title="Bank Vaults"
                  subtitle="Digital reserves"
                  rows={CURRENCIES.filter((c) => prefs.showCurrencies[c]).map((c) => ({
                    label: c, value: formatMinor(totals.bankByCur.get(c) ?? 0, c),
                  }))}
                />
              )}
            </div>
          )}

          {/* Recent Transactions */}
          {prefs.showRecent && (
            <PremiumCard className="overflow-hidden">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h2 className="font-serif text-lg font-semibold text-foreground">Recent Transactions</h2>
                <Link to="/app/transactions" className="text-sm text-gold hover:text-gold-soft font-medium">
                  View All →
                </Link>
              </div>
              <div className="overflow-x-auto">
                {isLoading ? (
                  <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
                ) : !data || data.recentTx.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">{t("dash.noTx")}</div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-[11px] bg-surface-2 border-b border-border uppercase tracking-[0.14em]">
                      <tr>
                        <th className="px-5 py-3 font-semibold text-gold">Transaction</th>
                        <th className="px-5 py-3 font-semibold text-gold hidden sm:table-cell">Channel</th>
                        <th className="px-5 py-3 font-semibold text-gold text-right">Amount</th>
                        <th className="px-5 py-3 font-semibold text-gold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recentTx.map((tx) => {
                        const isDeposit = tx.direction === "deposit";
                        const isWithdraw = tx.direction === "withdraw";
                        const amountClass = isDeposit
                          ? "text-emerald-400"
                          : isWithdraw
                          ? "text-red-400"
                          : "text-foreground";
                        const sign = isDeposit ? "+" : isWithdraw ? "-" : "";
                        return (
                          <tr key={tx.id} className="hover:bg-surface-2/50 transition-colors">
                            <td className="px-5 py-4">
                              <div className="font-medium text-foreground capitalize">{tx.direction}</div>
                              <div className="text-xs text-muted-foreground font-mono mt-0.5">{tx.tx_number}</div>
                            </td>
                            <td className="px-5 py-4 text-muted-foreground capitalize hidden sm:table-cell">{tx.channel}</td>
                            <td className="px-5 py-4 text-right">
                              <span className={`font-semibold tabular-nums ${amountClass}`}>
                                {sign}{formatMinor(tx.amount_minor, tx.currency)}
                              </span>
                              <div className="mt-1 flex justify-end">
                                <CurrencyBadge currency={tx.currency} />
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(tx.created_at)}</div>
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={tx.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </PremiumCard>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {isStaff && (
            <PremiumCard className="p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Button asChild variant="gold" className="w-full justify-center py-5">
                  <Link to="/app/transactions/new/deposit" className="flex items-center gap-2">
                    <ArrowDownRight className="w-4 h-4" /> New Deposit
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-center py-5 border-gold/30 text-foreground hover:bg-gold/10">
                  <Link to="/app/transactions/new/withdraw" className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4" /> New Withdraw
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="w-full justify-center py-5 text-muted-foreground hover:text-gold hover:bg-gold/5">
                  <Link to="/app/transactions/new" className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4" /> New Transaction
                  </Link>
                </Button>
              </div>
            </PremiumCard>
          )}

          {prefs.showPinnedCustomers && (
            <PinnedCustomers
              ids={prefs.pinnedAccountIds}
              onUnpin={(id) =>
                update({ ...prefs, pinnedAccountIds: prefs.pinnedAccountIds.filter((x) => x !== id) })
              }
            />
          )}

          {prefs.showHoldings && data && (
            <PremiumCard className="p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">Holdings Summary</h2>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
                  <Users className="w-6 h-6 text-gold" />
                </div>
                <div>
                  <div className="font-serif text-2xl font-bold text-foreground tabular-nums">{data.holderCount.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Total Active Holders</div>
                </div>
              </div>
              <div className="space-y-3">
                {CURRENCIES.map((c) => {
                  const v = totals.customerByCur.get(c) ?? 0;
                  const max = Math.max(...CURRENCIES.map((x) => totals.customerByCur.get(x) ?? 0), 1);
                  const pct = Math.round((v / max) * 100);
                  return (
                    <div key={c}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{c}</span>
                        <span className="text-foreground font-medium tabular-nums">{formatMinor(v, c)}</span>
                      </div>
                      <div className="w-full bg-surface-2 rounded-full h-1.5">
                        <div className="bg-gradient-gold h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </PremiumCard>
          )}
        </div>
      </div>
    </div>
  );
}

function VaultCard({ icon, title, subtitle, rows }: {
  icon: React.ReactNode; title: string; subtitle: string; rows: { label: string; value: string }[];
}) {
  return (
    <PremiumCard className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-surface-2 border border-border flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{r.label}</span>
            <span className="font-medium text-foreground tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </PremiumCard>
  );
}

function PinnedCustomers({ ids, onUnpin }: { ids: string[]; onUnpin: (id: string) => void }) {
  const numericIds = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const { data, isLoading } = useQuery({
    queryKey: ["dash.pinned.holders.v2", ids.slice().sort().join(",")],
    enabled: numericIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,status,holder_accounts(currency_code,current_balance)")
        .in("id", numericIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <PremiumCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pinned Customers</h2>
        <Users className="w-4 h-4 text-gold" />
      </div>
      {numericIds.length === 0 ? (
        <p className="text-xs text-muted-foreground">Pin customers via the Customize panel.</p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((h: any) => {
            const totals: Record<string, number> = {};
            for (const a of h.holder_accounts ?? []) {
              totals[a.currency_code] = (totals[a.currency_code] ?? 0) + Number(a.current_balance ?? 0);
            }
            const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
            return (
              <Link key={h.id} to="/app/holders/$id" params={{ id: String(h.id) }} className="block group">
                <div className="flex items-start justify-between p-3 rounded-lg bg-surface-2 border border-border group-hover:border-gold/40 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Star className="w-3.5 h-3.5 text-gold fill-gold" />
                      <span className="font-medium text-foreground text-sm truncate" dir="auto">{h.canonical_name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground mt-1 block font-mono">{h.dahab_account_number}</span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {top ? (
                      <>
                        <span className="text-sm font-semibold text-foreground tabular-nums block">
                          {Number(top[1]).toLocaleString()}
                        </span>
                        <CurrencyBadge currency={top[0]} />
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">No accounts</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); onUnpin(String(h.id)); }}
                    className="ml-2 p-1 rounded text-muted-foreground hover:text-gold opacity-0 group-hover:opacity-100 transition"
                    aria-label="Unpin"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PremiumCard>
  );
}

function CustomizeSheet({ prefs, onChange }: { prefs: DashPrefs; onChange: (p: DashPrefs) => void }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="p-2 text-muted-foreground hover:text-gold transition-colors bg-surface-2 rounded-lg border border-border" aria-label="Dashboard settings">
          <Settings className="w-5 h-5" />
        </button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif">Dashboard Settings</SheetTitle>
          <SheetDescription>Configure visible currencies, widgets, and pinned customers.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold">Visible Currencies</div>
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
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold">Widgets</div>
            <div className="space-y-2">
              <ToggleRow label="Cash Vaults" checked={prefs.showCash} onChange={(v) => onChange({ ...prefs, showCash: v })} />
              <ToggleRow label="Bank Vaults" checked={prefs.showBank} onChange={(v) => onChange({ ...prefs, showBank: v })} />
              <ToggleRow label="Recent Transactions" checked={prefs.showRecent} onChange={(v) => onChange({ ...prefs, showRecent: v })} />
              <ToggleRow label="Pinned Customers" checked={prefs.showPinnedCustomers} onChange={(v) => onChange({ ...prefs, showPinnedCustomers: v })} />
              <ToggleRow label="Holdings Summary" checked={prefs.showHoldings} onChange={(v) => onChange({ ...prefs, showHoldings: v })} />
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Pinned Customers</div>
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
  const [q, setQ] = useState("");
  const numericPinned = pinned.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const { data: results } = useQuery({
    queryKey: ["dash.pin.holders.search.v2", q],
    queryFn: async () => {
      const term = q.trim();
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
    queryKey: ["dash.pin.holders.list.v2", pinned.slice().sort().join(",")],
    enabled: numericPinned.length > 0,
    queryFn: async () => {
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
        <Input className="h-9 ps-7 text-xs" placeholder="Search by DAHAB #, name…" value={q} onChange={(e) => setQ(e.target.value)} />
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
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</li>
        ) : null}
      </ul>
    </div>
  );
}
