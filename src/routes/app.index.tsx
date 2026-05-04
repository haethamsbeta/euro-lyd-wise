import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatMinor, formatDateTime } from "@/lib/format";
import { ArrowDownCircle, ArrowUpCircle, PlusCircle, CheckCircle2, AlertTriangle, Wallet, Landmark, Users, Settings2, UserCircle2, Plus, X, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/")({ component: Dashboard });

const CURRENCIES = ["USD", "EUR", "LYD"] as const;
type Currency = (typeof CURRENCIES)[number];

type DashPrefs = {
  showCurrencies: Record<Currency, boolean>;
  showCash: boolean;
  showBank: boolean;
  showCustomerTotal: boolean;
  showRecent: boolean;
  showPinnedCustomers: boolean;
  pinnedAccountIds: string[];
};

const DEFAULT_PREFS: DashPrefs = {
  showCurrencies: { USD: true, EUR: true, LYD: true },
  showCash: true,
  showBank: true,
  showCustomerTotal: true,
  showRecent: true,
  showPinnedCustomers: true,
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
    if (key) {
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    }
  };
  return { prefs, update };
}

function Dashboard() {
  const t = useT();
  const { prefs, update } = usePrefs();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [accounts, balances, recentTx, pending] = await Promise.all([
        supabase.from("accounts").select("id, kind, name, vault_channel"),
        supabase.from("account_balances").select("account_id, currency, balance_minor"),
        supabase
          .from("transactions")
          .select("id, tx_number, direction, channel, currency, amount_minor, status, created_at, comment, customer_account_id")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      return {
        accounts: accounts.data ?? [],
        balances: balances.data ?? [],
        recentTx: recentTx.data ?? [],
        pendingCount: pending.count ?? 0,
      };
    },
  });

  const vaultByChannelCurrency = new Map<string, number>();
  const customerTotalsByCurrency = new Map<string, number>();
  // Map (channel, currency) -> vault account id, so each row in a tile can deep-link.
  const vaultIdByChannelCurrency = new Map<string, string>();
  // Fallback: any vault id for a given channel (used when that channel has no balance row for this currency yet).
  const vaultIdByChannel = new Map<string, string>();

  if (data) {
    const accById = new Map(data.accounts.map((a) => [a.id, a]));
    for (const b of data.balances) {
      const acc = accById.get(b.account_id);
      if (!acc) continue;
      if (acc.kind === "vault") {
        vaultByChannelCurrency.set(`${acc.vault_channel}-${b.currency}`, b.balance_minor);
        vaultIdByChannelCurrency.set(`${acc.vault_channel}-${b.currency}`, acc.id);
      } else {
        customerTotalsByCurrency.set(b.currency, (customerTotalsByCurrency.get(b.currency) ?? 0) + b.balance_minor);
      }
    }
    for (const a of data.accounts) {
      if (a.kind === "vault" && a.vault_channel && !vaultIdByChannel.has(a.vault_channel)) {
        vaultIdByChannel.set(a.vault_channel, a.id);
      }
    }
  }

  return (
    <div>
      <PageHeader
        title={t("dash.title")}
        description={t("dash.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <CustomizeSheet prefs={prefs} onChange={update} />
            <Button asChild>
              <Link to="/app/transactions/new"><PlusCircle className="h-4 w-4" /> {t("dash.newTransaction")}</Link>
            </Button>
          </div>
        }
      />
      <div className="space-y-6 p-4 sm:p-6">
        {data && data.pendingCount > 0 ? (
          <Card className="border-warning/50 bg-warning/10 shadow-gold">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/20 ring-1 ring-warning/40">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
                {data.pendingCount} {data.pendingCount > 1 ? t("dash.pendingMany") : t("dash.pendingOne")}
              </div>
              <Button asChild size="sm" variant="outline" className="ms-auto"><Link to="/app/approvals">{t("dash.review")}</Link></Button>
            </CardContent>
          </Card>
        ) : null}

        {prefs.showPinnedCustomers && prefs.pinnedAccountIds.length > 0 ? (
          <PinnedCustomerAccounts
            ids={prefs.pinnedAccountIds}
            onUnpin={(id) =>
              update({ ...prefs, pinnedAccountIds: prefs.pinnedAccountIds.filter((x) => x !== id) })
            }
          />
        ) : null}

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("dash.vaultsRecon")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CURRENCIES.filter((c) => prefs.showCurrencies[c]).map((cur) => {
              const cash = vaultByChannelCurrency.get(`cash-${cur}`) ?? 0;
              const bank = vaultByChannelCurrency.get(`bank-${cur}`) ?? 0;
              const customer = customerTotalsByCurrency.get(cur) ?? 0;
              const matches = cash + bank === customer;
              const total = cash + bank;
              return (
                <Card key={cur} className="card-luxe overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="font-serif text-lg tracking-wide text-gold">{cur}</span>
                      {matches ? (
                        <Badge variant="secondary" className="gap-1 border border-success/30 bg-success/10 text-success">
                          <CheckCircle2 className="h-3 w-3" /> {t("dash.reconciled")}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {t("dash.mismatch")}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="rounded-lg border border-[oklch(0.78_0.13_82/0.25)] bg-[oklch(0.78_0.13_82/0.06)] p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t("dash.vaultsTotal")}
                      </div>
                      <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
                        {formatMinor(total, cur)}
                      </div>
                    </div>
                    {prefs.showCash ? (
                      <VaultRow
                        icon={<Wallet className="h-3.5 w-3.5 text-gold" />}
                        label={t("dash.cashVault")}
                        value={formatMinor(cash, cur)}
                        vaultId={vaultIdByChannelCurrency.get(`cash-${cur}`) ?? vaultIdByChannel.get("cash")}
                        currency={cur}
                      />
                    ) : null}
                    {prefs.showBank ? (
                      <VaultRow
                        icon={<Landmark className="h-3.5 w-3.5 text-gold" />}
                        label={t("dash.bankVault")}
                        value={formatMinor(bank, cur)}
                        vaultId={vaultIdByChannelCurrency.get(`bank-${cur}`) ?? vaultIdByChannel.get("bank")}
                        currency={cur}
                      />
                    ) : null}
                    {prefs.showCustomerTotal ? (
                    <div className="border-t border-[oklch(0.78_0.13_82/0.20)] pt-2">
                      <Link
                        to="/app/holders"
                        className="-mx-2 flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-[oklch(0.78_0.13_82/0.10)] focus:outline-none focus-visible:bg-[oklch(0.78_0.13_82/0.10)]"
                      >
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {t("dash.customersTotal")}
                        </span>
                        <span className="font-mono font-semibold text-foreground">{formatMinor(customer, cur)}</span>
                      </Link>
                    </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {prefs.showRecent ? (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("dash.recentTx")}</h2>
          <Card className="card-luxe">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
              ) : data && data.recentTx.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">{t("dash.noTx")}</div>
              ) : (
                <ul className="divide-y divide-[oklch(0.78_0.13_82/0.15)]">
                  {data?.recentTx.map((tx) => (
                    <li key={tx.id}>
                      {tx.customer_account_id ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                          <RecentTransactionContent tx={tx} />
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                          <RecentTransactionContent tx={tx} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
        ) : null}
      </div>
    </div>
  );
}

function CustomizeSheet({ prefs, onChange }: { prefs: DashPrefs; onChange: (p: DashPrefs) => void }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4" /> Customize
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Customize dashboard</SheetTitle>
          <SheetDescription>Toggle which tiles appear. Saved on this device.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 8rem)" }}>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currencies</div>
            <div className="space-y-2">
              {CURRENCIES.map((c) => (
                <div key={c} className="flex items-center justify-between rounded-md border p-2">
                  <Label htmlFor={`cur-${c}`}>{c}</Label>
                  <Switch
                    id={`cur-${c}`}
                    checked={prefs.showCurrencies[c]}
                    onCheckedChange={(v) =>
                      onChange({ ...prefs, showCurrencies: { ...prefs.showCurrencies, [c]: v } })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tiles</div>
            <div className="space-y-2">
              <ToggleRow label="Cash vault row" checked={prefs.showCash} onChange={(v) => onChange({ ...prefs, showCash: v })} />
              <ToggleRow label="Bank vault row" checked={prefs.showBank} onChange={(v) => onChange({ ...prefs, showBank: v })} />
              <ToggleRow label="Customer totals row" checked={prefs.showCustomerTotal} onChange={(v) => onChange({ ...prefs, showCustomerTotal: v })} />
              <ToggleRow label="Pinned customer accounts" checked={prefs.showPinnedCustomers} onChange={(v) => onChange({ ...prefs, showPinnedCustomers: v })} />
              <ToggleRow label="Recent transactions" checked={prefs.showRecent} onChange={(v) => onChange({ ...prefs, showRecent: v })} />
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pinned customer accounts</div>
              <span className="text-[10px] text-muted-foreground">{prefs.pinnedAccountIds.length} pinned</span>
            </div>
            <PinAccountPicker
              pinned={prefs.pinnedAccountIds}
              onAdd={(id) => {
                if (prefs.pinnedAccountIds.includes(id)) return;
                onChange({ ...prefs, pinnedAccountIds: [...prefs.pinnedAccountIds, id] });
              }}
              onRemove={(id) => onChange({ ...prefs, pinnedAccountIds: prefs.pinnedAccountIds.filter((x) => x !== id) })}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PinnedCustomerAccounts({ ids, onUnpin }: { ids: string[]; onUnpin: (id: string) => void }) {
  const t = useT();
  const numericIds = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const { data, isLoading } = useQuery({
    queryKey: ["dash.pinned.holders", ids.slice().sort().join(",")],
    enabled: numericIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,status,holder_accounts(id,currency_code,account_number,current_balance)")
        .in("id", numericIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {t("dash.pinnedCustomers")}
      </h2>
      {isLoading ? (
        <Card className="card-luxe"><CardContent className="p-4 text-sm text-muted-foreground">{t("common.loading")}</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((h: any) => {
            const totals: Record<string, number> = {};
            for (const a of h.holder_accounts ?? []) {
              const c = a.currency_code as string;
              totals[c] = (totals[c] ?? 0) + Number(a.current_balance ?? 0);
            }
            const currencies = Object.keys(totals).sort();
            return (
              <Card key={h.id} className="card-luxe group relative overflow-hidden">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); onUnpin(String(h.id)); }}
                  className="absolute end-2 top-2 z-10 rounded-md bg-background/80 p-1 text-muted-foreground backdrop-blur-sm transition hover:bg-muted hover:text-foreground"
                  aria-label="Unpin"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <Link to="/app/holders/$id" params={{ id: String(h.id) }} className="block">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UserCircle2 className="h-4 w-4 text-gold" />
                      <span className="truncate" dir="auto">{h.canonical_name}</span>
                    </CardTitle>
                    <div className="font-mono text-[11px] text-gold">{h.dahab_account_number}</div>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    {currencies.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No linked accounts</div>
                    ) : currencies.map((c) => (
                      <div key={c} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{c}</span>
                        <span className="font-mono text-foreground/90">{Number(totals[c]).toLocaleString()} {c}</span>
                      </div>
                    ))}
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PinAccountPicker({ pinned, onAdd, onRemove }: { pinned: string[]; onAdd: (id: string) => void; onRemove: (id: string) => void }) {
  const [q, setQ] = useState("");
  const numericPinned = pinned.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const { data: results } = useQuery({
    queryKey: ["dash.pin.holders.search", q],
    queryFn: async () => {
      const term = q.trim();
      if (term) {
        const [byHolder, byAccount] = await Promise.all([
          supabase
            .from("account_holders")
            .select("id, dahab_account_number, canonical_name")
            .or(`dahab_account_number.ilike.%${term}%,canonical_name.ilike.%${term}%,normalized_name.ilike.%${term}%`)
            .limit(15),
          supabase
            .from("holder_accounts")
            .select("account_holder_id, account_holders!inner(id, dahab_account_number, canonical_name)")
            .ilike("account_number", `%${term}%`)
            .limit(15),
        ]);
        const m = new Map<number, any>();
        for (const h of byHolder.data ?? []) m.set(h.id, h);
        for (const a of byAccount.data ?? []) {
          const h: any = (a as any).account_holders;
          if (h) m.set(h.id, h);
        }
        return Array.from(m.values()).map((h: any) => ({ id: String(h.id), name: h.canonical_name, account_number: h.dahab_account_number }));
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
    queryKey: ["dash.pin.holders.list", pinned.slice().sort().join(",")],
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
        <ul className="space-y-1 rounded-md border p-1.5">
          {pinnedRows.map((a: any) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium">{a.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{a.account_number}</div>
              </div>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onRemove(a.id)} aria-label="Remove">
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-8 ps-7 text-xs" placeholder="Search by DAHAB #, name, or account #…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border p-1">
        {(results ?? []).filter((a: any) => !pinned.includes(a.id)).map((a: any) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onAdd(a.id)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-start text-xs hover:bg-muted"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{a.name}</div>
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

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Row({ label, value, bold, icon }: { label: string; value: string; bold?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={"font-mono " + (bold ? "font-semibold text-foreground" : "text-foreground/90")}>{value}</span>
    </div>
  );
}

function VaultRow({ label, value, icon, vaultId, currency }: { label: string; value: string; icon?: React.ReactNode; vaultId?: string; currency?: "USD" | "EUR" | "LYD" }) {
  if (!vaultId) {
    return <Row label={label} value={value} icon={icon} />;
  }
  return (
    <Link
      to="/app/vaults/$id"
      params={{ id: vaultId }}
      search={currency ? { currency } : {}}
      className="-mx-2 flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-[oklch(0.78_0.13_82/0.10)] focus:outline-none focus-visible:bg-[oklch(0.78_0.13_82/0.10)]"
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-mono text-foreground/90">{value}</span>
    </Link>
  );
}

function RecentTransactionContent({ tx }: { tx: any }) {
  const t = useT();
  return (
    <>
      <div className={
        tx.direction === "deposit"
          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 ring-1 ring-success/30"
          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 ring-1 ring-destructive/30"
      }>
        {tx.direction === "deposit" ? (
          <ArrowDownCircle className="h-5 w-5 text-success" />
        ) : (
          <ArrowUpCircle className="h-5 w-5 text-destructive" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-foreground">{tx.tx_number} · {t(`tx.direction.${tx.direction}`)} · {t(`tx.channel.${tx.channel}`)}</div>
        {tx.comment ? <div className="truncate text-xs text-muted-foreground">{tx.comment}</div> : null}
      </div>
      <div className="ms-auto text-end">
        <div className="font-mono text-base font-semibold text-foreground">{formatMinor(tx.amount_minor, tx.currency)}</div>
        <div className="text-xs text-muted-foreground">{formatDateTime(tx.created_at)}</div>
      </div>
      <Badge className="shrink-0" variant={tx.status === "posted" ? "secondary" : tx.status === "pending" ? "outline" : "destructive"}>
        {t(`tx.status.${tx.status}`)}
      </Badge>
    </>
  );
}