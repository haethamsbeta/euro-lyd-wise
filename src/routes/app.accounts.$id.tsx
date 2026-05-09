import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import {
  ArrowLeft, ArrowDownRight, ArrowUpRight, Pencil, MoreVertical,
  TrendingUp, TrendingDown, Wallet, ShieldCheck, Search, Download, X, Check,
} from "lucide-react";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { toast } from "sonner";
import { useDebounced } from "@/hooks/use-debounced";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/app/accounts/$id")({
  component: AccountDetail,
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <p className="font-serif text-2xl">Account not found</p>
      <p className="mt-2 text-sm text-muted-foreground">This account doesn't exist or you don't have access.</p>
      <Button asChild variant="outline" className="mt-4"><Link to="/app/holders">Back to Holders</Link></Button>
    </div>
  ),
});

type Currency = "LYD" | "USD" | "EUR" | "GBP" | string;

const CURRENCY_TINT: Record<string, { ring: string; text: string; bg: string; gradient: string }> = {
  LYD: { ring: "border-[oklch(0.82_0.14_85/0.4)]", text: "text-gold", bg: "bg-[oklch(0.82_0.14_85/0.08)]", gradient: "from-[oklch(0.82_0.14_85/0.18)] via-transparent to-transparent" },
  USD: { ring: "border-[oklch(0.7_0.18_150/0.35)]", text: "text-[var(--success)]", bg: "bg-[oklch(0.7_0.18_150/0.06)]", gradient: "from-[oklch(0.7_0.18_150/0.16)] via-transparent to-transparent" },
  EUR: { ring: "border-[#7AA8E8]/35", text: "text-[#7AA8E8]", bg: "bg-[#7AA8E8]/06", gradient: "from-[#7AA8E8]/18 via-transparent to-transparent" },
  GBP: { ring: "border-[#C394E0]/35", text: "text-[#C394E0]", bg: "bg-[#C394E0]/06", gradient: "from-[#C394E0]/18 via-transparent to-transparent" },
};
function tint(c?: string) { return CURRENCY_TINT[(c ?? "").toUpperCase()] ?? CURRENCY_TINT.LYD; }

const PRESETS: Record<string, { values: number[]; step: number }> = {
  LYD: { values: [50_000, 250_000, 1_000_000], step: 1000 },
  USD: { values: [1_000, 5_000, 25_000], step: 100 },
  EUR: { values: [1_000, 5_000, 25_000], step: 100 },
  GBP: { values: [1_000, 5_000, 25_000], step: 100 },
};

function fmt(n: number, c?: string) {
  return `${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}${c ? ` ${c}` : ""}`;
}

function AccountDetail() {
  const { id } = Route.useParams();
  const accountId = Number(id);
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const isTeller = hasAnyRole(roles, ["teller"]);
  const canPost = isAdmin || isTeller;

  const accountQ = useQuery({
    queryKey: ["account.detail", accountId],
    enabled: Number.isFinite(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holder_accounts")
        .select("id,account_number,dahab_account_number,currency_code,account_nature,account_display_name,account_alias_name,current_balance,status,credit_limit,debit_limit,withdraw_limit_enabled,withdraw_limit_amount,account_holder_id,account_holders!inner(id,canonical_name,dahab_account_number,holder_type,phone)")
        .eq("id", accountId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ledgerQ = useQuery({
    queryKey: ["account.ledger", accountId],
    enabled: Number.isFinite(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holder_ledger_entries")
        .select("id,tx_number,posted_at,description,debit_amount,credit_amount,balance_after,currency_code")
        .eq("account_id", accountId)
        .order("posted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const a = accountQ.data;
  const t = tint(a?.currency_code);

  const ledger = ledgerQ.data ?? [];
  const sparkPoints = useMemo(() => {
    const pts = [...ledger].reverse().slice(-30).map((e) => Number(e.balance_after ?? 0));
    return pts;
  }, [ledger]);

  const stats30d = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    let credits = 0, debits = 0;
    for (const e of ledger) {
      if (new Date(e.posted_at).getTime() >= cutoff) {
        credits += Number(e.credit_amount ?? 0);
        debits += Number(e.debit_amount ?? 0);
      }
    }
    return { credits, debits };
  }, [ledger]);

  if (accountQ.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading account…</div>;
  }
  if (!a) {
    return (
      <div className="p-8 text-center">
        <p className="font-serif text-2xl">Account not found</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/app/holders">Back to Holders</Link></Button>
      </div>
    );
  }

  const currency = a.currency_code;
  const balance = Number(a.current_balance ?? 0);
  const wlEnabled = !!a.withdraw_limit_enabled;
  const wlAmount = Number(a.withdraw_limit_amount ?? 0);
  const available = balance + (wlEnabled ? wlAmount : 0);
  const utilRaw = balance < 0 && wlEnabled && wlAmount > 0 ? Math.min(1, Math.abs(balance) / wlAmount) : 0;
  const utilPct = Math.round(utilRaw * 100);
  const utilTone = utilPct >= 90 ? "bg-destructive" : utilPct >= 70 ? "bg-amber-500" : "bg-[var(--success)]";

  const holder = (a as any).account_holders;

  return (
    <div>
      <PageHeader
        title={a.account_display_name || a.account_number}
        description={`Account · ${a.account_number}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/holders/$id" params={{ id: String(a.account_holder_id) }}>
              <ArrowLeft className="h-4 w-4 me-1" /> Holder
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {/* HERO */}
        <Card className={cn("card-luxe overflow-hidden border", t.ring)}>
          <div className={cn("bg-gradient-to-br p-5", t.gradient)}>
            <div className="flex flex-wrap items-start gap-3">
              <CurrencyBadge currency={currency} />
              <span className="font-mono text-sm">{a.account_number}</span>
              {a.dahab_account_number ? (
                <Badge variant="outline" className="font-mono text-gold">{a.dahab_account_number}</Badge>
              ) : null}
              <Badge variant="outline">{a.account_nature}</Badge>
              <Badge variant={a.status === "ACTIVE" ? "secondary" : "outline"}>{a.status}</Badge>
              <div className="ms-auto flex items-center gap-2">
                {canPost ? (
                  <>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/app/transactions/new/deposit"><ArrowDownRight className="h-4 w-4 me-1" /> Deposit</Link>
                    </Button>
                    <Button asChild size="sm" variant="gold">
                      <Link to="/app/transactions/new/withdraw"><ArrowUpRight className="h-4 w-4 me-1" /> Withdraw</Link>
                    </Button>
                  </>
                ) : null}
                {isAdmin ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="outline"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toast.info("Suspend not yet wired")}>Suspend</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => toast.info("Close not yet wired")}>Close account</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div className={cn("order-1 text-start font-serif text-3xl md:text-4xl", t.text)}>
                {fmt(balance, currency)}
              </div>
              <div className="order-2 min-w-0 text-end">
                <div className="text-base text-foreground/80" dir="rtl">{a.account_display_name}</div>
                {a.account_alias_name ? <div className="text-xs text-muted-foreground">{a.account_alias_name}</div> : null}
                <div className="mt-2 text-xs text-muted-foreground">
                  Held by{" "}
                  <Link to="/app/holders/$id" params={{ id: String(a.account_holder_id) }} className="text-gold underline-offset-2 hover:underline">
                    {holder?.canonical_name}
                  </Link>
                  {holder?.dahab_account_number ? <span className="font-mono"> · {holder.dahab_account_number}</span> : null}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile icon={<Wallet className="h-4 w-4" />} label="Current balance" value={fmt(balance, currency)} tone="default" />
          <KpiTile icon={<ShieldCheck className="h-4 w-4" />} label="Available" value={fmt(available, currency)} tone="default"
            hint={wlEnabled ? `incl. ${fmt(wlAmount, currency)} limit` : "no withdraw limit"} />
          <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="30d Credits" value={fmt(stats30d.credits, currency)} tone="success" />
          <KpiTile icon={<TrendingDown className="h-4 w-4" />} label="30d Debits" value={fmt(stats30d.debits, currency)} tone="danger" />
        </div>

        {/* Sparkline */}
        <Card className="card-luxe">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Balance · last 30 entries</div>
              <div className="text-[11px] text-muted-foreground">{sparkPoints.length} pts</div>
            </div>
            <Sparkline points={sparkPoints} colorClass={t.text} />
          </CardContent>
        </Card>

        {/* Withdrawal Limits */}
        {isAdmin ? (
          <WithdrawLimitsCard account={a} utilPct={utilPct} utilTone={utilTone} />
        ) : (
          <Card className="card-luxe">
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Withdrawal limit</div>
              <div className="mt-1 font-mono text-base">
                {wlEnabled ? fmt(wlAmount, currency) : <span className="text-muted-foreground">Not set</span>}
              </div>
              {wlEnabled ? (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-card/60">
                    <div className={cn("h-full transition-all", utilTone)} style={{ width: `${utilPct}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{utilPct}% used</div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Credit / Debit limits (admin) */}
        {isAdmin ? <LimitsCard account={a} /> : null}

        {/* Transactions */}
        <TransactionsTable rows={ledger} loading={ledgerQ.isLoading} currency={currency} accountId={accountId} />
      </div>
    </div>
  );
}

function KpiTile({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone: "default" | "success" | "danger" }) {
  const toneCls = tone === "success" ? "text-[var(--success)]" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Card className="card-luxe">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className={toneCls}>{icon}</span>{label}
        </div>
        <div className={cn("mt-1 font-serif text-xl", toneCls)}>{value}</div>
        {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function Sparkline({ points, colorClass }: { points: number[]; colorClass: string }) {
  if (points.length < 2) return <div className="py-6 text-center text-xs text-muted-foreground">Not enough data for trend.</div>;
  const w = 600, h = 80, pad = 4;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const d = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = points[points.length - 1];
  const lx = pad + (points.length - 1) * step;
  const ly = h - pad - ((last - min) / range) * (h - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-20 w-full", colorClass)} preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="currentColor" />
    </svg>
  );
}

function WithdrawLimitsCard({ account, utilPct, utilTone }: { account: any; utilPct: number; utilTone: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(!!account.withdraw_limit_enabled);
  const [amount, setAmount] = useState<string>(String(account.withdraw_limit_amount ?? 0));
  const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const currency = account.currency_code;
  const presets = PRESETS[currency] ?? PRESETS.USD;

  useEffect(() => { setEnabled(!!account.withdraw_limit_enabled); setAmount(String(account.withdraw_limit_amount ?? 0)); }, [account.id, account.withdraw_limit_enabled, account.withdraw_limit_amount]);

  useEffect(() => {
    if (!editing) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setEditing(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [editing]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("sp_set_holder_withdraw_limit", {
        p_holder_account_id: account.id,
        p_enabled: enabled,
        p_amount: Number(amount) || 0,
        p_note: note || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Withdrawal limit updated", { duration: 2500 });
      qc.invalidateQueries({ queryKey: ["account.detail", account.id] });
      setEditing(false); setNote("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed", { duration: 2500 }),
  });

  return (
    <Card className="card-luxe" ref={ref as any}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Withdrawal limit · {currency}</div>
            <div className="mt-1 font-mono text-lg">
              {account.withdraw_limit_enabled ? fmt(Number(account.withdraw_limit_amount ?? 0), currency) : <span className="text-muted-foreground">Disabled</span>}
            </div>
          </div>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 me-1" /> Edit
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {account.withdraw_limit_enabled ? (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-card/60">
              <div className={cn("h-full transition-all", utilTone)} style={{ width: `${utilPct}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{utilPct}% used</div>
          </div>
        ) : null}

        {editing ? (
          <div className="mt-4 space-y-3 border-t border-gold/15 pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enable withdrawal limit
            </label>
            <div>
              <label className="block text-xs text-muted-foreground">Amount ({currency})</label>
              <Input type="number" min="0" step={presets.step} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-48" disabled={!enabled} />
              <div className="mt-2 flex flex-wrap gap-1">
                {presets.values.map((v) => (
                  <Button key={v} type="button" size="sm" variant="outline" disabled={!enabled} onClick={() => setAmount(String(v))}>
                    {v.toLocaleString()}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground">Note (optional)</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" variant="gold" onClick={() => save.mutate()} disabled={save.isPending}>
                <Check className="h-3.5 w-3.5 me-1" /> Save
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LimitsCard({ account }: { account: any }) {
  const qc = useQueryClient();
  const [credit, setCredit] = useState(String(account.credit_limit ?? 0));
  const [debit, setDebit] = useState(String(account.debit_limit ?? 0));
  useEffect(() => { setCredit(String(account.credit_limit ?? 0)); setDebit(String(account.debit_limit ?? 0)); }, [account.id, account.credit_limit, account.debit_limit]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("holder_accounts").update({ credit_limit: Number(credit) || 0, debit_limit: Number(debit) || 0 }).eq("id", account.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limits updated", { duration: 2500 });
      qc.invalidateQueries({ queryKey: ["account.detail", account.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <Card className="card-luxe">
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Credit / Debit limits · {account.currency_code}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Use 0 to leave a limit unset.</div>
        </div>
        <div className="ms-auto flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-muted-foreground">Credit</label>
            <Input type="number" min="0" step="0.01" value={credit} onChange={(e) => setCredit(e.target.value)} className="w-36" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Debit</label>
            <Input type="number" min="0" step="0.01" value={debit} onChange={(e) => setDebit(e.target.value)} className="w-36" />
          </div>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Pencil className="h-3.5 w-3.5 me-1" /> Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type SortKey = "date" | "credit" | "debit" | "balance";

function TransactionsTable({ rows, loading, currency, accountId }: { rows: any[]; loading: boolean; currency: string; accountId: number }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 200);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    let r = rows;
    if (debounced) {
      const q = debounced.toLowerCase();
      r = r.filter((e) => (e.tx_number ?? "").toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q));
    }
    if (from) r = r.filter((e) => new Date(e.posted_at) >= new Date(from));
    if (to) r = r.filter((e) => new Date(e.posted_at) <= new Date(to + "T23:59:59"));
    const key: Record<SortKey, (e: any) => number> = {
      date: (e) => new Date(e.posted_at).getTime(),
      credit: (e) => Number(e.credit_amount ?? 0),
      debit: (e) => Number(e.debit_amount ?? 0),
      balance: (e) => Number(e.balance_after ?? 0),
    };
    const f = key[sortKey];
    return [...r].sort((a, b) => sortDir === "asc" ? f(a) - f(b) : f(b) - f(a));
  }, [rows, debounced, from, to, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "date" ? "desc" : "desc"); }
  }

  function exportCsv() {
    const head = ["Date", "TX", "Description", "Debit", "Credit", "Balance"];
    const data = filtered.map((e) => [new Date(e.posted_at).toISOString(), e.tx_number, e.description ?? "", e.debit_amount, e.credit_amount, e.balance_after]);
    const csv = [head, ...data].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `account-${accountId}-ledger.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="card-luxe">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search TX# or description" className="ps-8" />
            </div>
          </div>
          <label className="text-xs text-muted-foreground">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ms-2 rounded border bg-background px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ms-2 rounded border bg-background px-2 py-1 text-sm" />
          </label>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-3.5 w-3.5 me-1" /> CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="text-left text-sm uppercase tracking-wide text-muted-foreground">
                <Th label="Date" k="date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th className="p-4">TX #</th>
                <th className="p-4">Description</th>
                <Th label="Debit" k="debit" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                <Th label="Credit" k="credit" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                <Th label={`Balance (${currency})`} k="balance" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-base text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-base text-muted-foreground">No matching transactions.</td></tr>
              ) : filtered.map((e) => (
                <tr key={e.id} className="border-t border-gold/10 hover:bg-gold/5">
                  <td className="p-4 text-sm whitespace-nowrap">{new Date(e.posted_at).toLocaleString()}</td>
                  <td className="p-4 font-mono text-sm text-gold whitespace-nowrap">{e.tx_number}</td>
                  <td className="p-4 text-base">{e.description}</td>
                  <td className="p-4 text-right text-base text-destructive tabular-nums">{Number(e.debit_amount) ? fmt(Number(e.debit_amount)) : "—"}</td>
                  <td className="p-4 text-right text-base text-[var(--success)] tabular-nums">{Number(e.credit_amount) ? fmt(Number(e.credit_amount)) : "—"}</td>
                  <td className="p-4 text-right text-base font-semibold tabular-nums">{fmt(Number(e.balance_after))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({ label, k, sortKey, sortDir, onClick, className }: { label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; onClick: (k: SortKey) => void; className?: string }) {
  const active = sortKey === k;
  return (
    <th className={cn("p-4", className)}>
      <button type="button" onClick={() => onClick(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-gold")}>
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </button>
    </th>
  );
}