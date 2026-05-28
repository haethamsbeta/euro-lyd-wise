import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
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
import { useEffectiveRoles } from "@/lib/role-view";
import { toast } from "sonner";
import { useDebounced } from "@/hooks/use-debounced";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { RoleGate } from "@/components/app/app-shell";
import { displayTxNumber, sourceCashEntryCode, sourceEntryCode } from "@/lib/txDisplay";

function visibleTx(row: { display_tx_number?: string | null; source_entry_code?: string | null; source_cash_entry_code?: string | null; tx_number?: string | null }) {
  return row.display_tx_number ?? row.source_entry_code ?? row.source_cash_entry_code ?? row.tx_number ?? "";
}

export const Route = createFileRoute("/app/accounts/$id")({
  head: () => ({ meta: [{ title: "Account details — Dahab" }, { name: "description", content: "View account balance, statement, and transactions in the Dahab back-office." }] }), component: () => (
    <RoleGate allow={["admin", "auditor"]}>
      <AccountDetail />
    </RoleGate>
  ),
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
  const accountIdNum = Number(id);
  const accountId: number | string = Number.isFinite(accountIdNum) ? accountIdNum : id;
  const roles = useEffectiveRoles();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const isTeller = hasAnyRole(roles, ["teller"]);
  const canPost = isAdmin || isTeller;

  const accountQ = useQuery({
    queryKey: ["account.detail", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const r: any = await api.accounts.get(accountId);
        return {
          id: r.id,
          account_number: r.account_number,
          dahab_account_number: r.dahab_account_number ?? null,
          currency_code: r.currency_code,
          account_nature: r.account_nature ?? null,
          account_display_name: r.account_display_name ?? null,
          account_alias_name: r.account_alias_name ?? null,
          current_balance: Number(r.current_balance ?? 0),
          status: r.status ?? "ACTIVE",
          credit_limit: Number(r.credit_limit ?? 0),
          debit_limit: Number(r.debit_limit ?? 0),
          withdraw_limit_enabled: !!r.withdraw_limit_enabled,
          withdraw_limit_amount: Number(r.withdraw_limit_amount ?? 0),
          available_to_withdraw: r.available_to_withdraw_amount != null
            ? Number(r.available_to_withdraw_amount)
            : null,
          linked_ledger_count: r.linked_ledger_count ?? null,
          account_holder_id: r.account_holder_id ?? r.holder_id ?? null,
          account_holders: {
            id: r.account_holder_id ?? r.holder_id ?? null,
            canonical_name: r.holder_name ?? r.canonical_name ?? "",
            dahab_account_number: r.holder_dahab_account_number ?? null,
            holder_type: r.holder_type ?? null,
            phone: r.holder_phone ?? null,
          },
        };
      }
      const { data, error } = await supabase
        .from("holder_accounts")
        .select("id,account_number,dahab_account_number,currency_code,account_nature,account_display_name,account_alias_name,current_balance,status,credit_limit,debit_limit,withdraw_limit_enabled,withdraw_limit_amount,account_holder_id,account_holders!inner(id,canonical_name,dahab_account_number,holder_type,phone)")
        .eq("id", accountIdNum)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ledgerQ = useQuery({
    queryKey: ["account.ledger", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const res: any = await api.accounts.ledger(accountId, { limit: 500, offset: 0 });
        const items: any[] = Array.isArray(res) ? res : (res?.items ?? []);
        return items.map((e: any) => ({
          id: e.id,
          tx_number: e.tx_number,
          source_entry_code: sourceEntryCode(e),
          source_cash_entry_code: sourceCashEntryCode(e),
          display_tx_number: displayTxNumber(e),
          posted_at: e.posted_at,
          description: e.description ?? "",
          // Backend returns minor units; convert for the existing display helpers.
          debit_amount: e.debit_amount != null
            ? Number(e.debit_amount)
            : Number(e.debit_minor ?? 0) / 100,
          credit_amount: e.credit_amount != null
            ? Number(e.credit_amount)
            : Number(e.credit_minor ?? 0) / 100,
          balance_after:
            e.balance_after_minor != null
              ? Number(e.balance_after_minor) / 100
              : e.balance_after != null
                ? Number(e.balance_after)
                : null,
          currency_code: e.currency_code,
        }));
      }
      const { data, error } = await supabase
        .from("holder_ledger_entries")
        .select("id,tx_number,posted_at,description,debit_amount,credit_amount,balance_after,currency_code")
        .eq("account_id", accountIdNum)
        .order("posted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((e: any) => ({
        ...e,
        source_entry_code: sourceEntryCode(e),
        source_cash_entry_code: sourceCashEntryCode(e),
        display_tx_number: displayTxNumber(e),
      }));
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
  const backendAvailable = (a as any).available_to_withdraw;
  const available = backendAvailable != null
    ? Number(backendAvailable)
    : balance + (wlEnabled ? wlAmount : 0);
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
            <Link to="/app/accounts">
              <ArrowLeft className="h-4 w-4 me-1" /> Back to Linked Accounts
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

        {/* Account Limits (Balance limit + Credit limit) */}
        <AccountLimitsCard account={a} isAdmin={isAdmin} />

        {/* Transactions */}
        <TransactionsTable rows={ledger} loading={ledgerQ.isLoading} currency={currency} accountId={String(accountId)} />
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
      if (DATA_BACKEND === "lambda") {
        const env = await api.accounts.setWithdrawLimit(account.id, {
          withdraw_limit_enabled: enabled,
          withdraw_limit_amount: enabled ? Number(amount) || 0 : null,
          ...(note ? { withdraw_limit_note: note } : {}),
        });
        return env;
      }
      const { error } = await supabase.rpc("sp_set_holder_withdraw_limit", {
        p_holder_account_id: account.id,
        p_enabled: enabled,
        p_amount: Number(amount) || 0,
        p_note: note || undefined,
      });
      if (error) throw error;
      return null;
    },
    onSuccess: (res: any) => {
      toast.success(res?.message ?? "Withdrawal limit updated", { duration: 2500 });
      qc.invalidateQueries({ queryKey: ["account.detail", account.id] });
      qc.invalidateQueries({ queryKey: ["accounts.list"] });
      qc.invalidateQueries({ queryKey: ["holder.detail"] });
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

function TransactionsTable({ rows, loading, currency, accountId }: { rows: any[]; loading: boolean; currency: string; accountId: string | number }) {
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
      r = r.filter((e: any) =>
        (e.tx_number ?? "").toLowerCase().includes(q) ||
        (e.source_entry_code ?? "").toLowerCase().includes(q) ||
        (e.display_tx_number ?? "").toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q),
      );
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
    const data = filtered.map((e: any) => [new Date(e.posted_at).toISOString(), visibleTx(e), e.description ?? "", e.debit_amount, e.credit_amount, e.balance_after]);
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
          <ExportPdfButton
            title={`DAHAB Account Ledger — ${accountId}`}
            filenamePrefix={`dahab-ledger-${accountId}`}
            columns={[
              { header: "Date", width: 120 },
              { header: "TX", width: 100 },
              { header: "Description" },
              { header: "Debit", width: 80 },
              { header: "Credit", width: 80 },
              { header: "Balance", width: 90 },
            ]}
            buildRows={(fromD: Date, toD: Date) =>
              filtered
                .filter((e: any) => {
                  const d = new Date(e.posted_at).getTime();
                  return d >= fromD.getTime() && d <= toD.getTime();
                })
                .map((e: any) => [
                  new Date(e.posted_at).toLocaleString(),
                  visibleTx(e),
                  String(e.description ?? ""),
                  String(e.debit_amount ?? ""),
                  String(e.credit_amount ?? ""),
                  String(e.balance_after ?? ""),
                ])
            }
          />
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
                <tr><td colSpan={6} className="p-8 text-center text-base text-muted-foreground">{rows.length === 0 ? "No ledger activity for this account." : "No matching transactions."}</td></tr>
              ) : filtered.map((e) => (
                <tr key={e.id} className="border-t border-gold/10 hover:bg-gold/5">
                  <td className="p-4 text-sm whitespace-nowrap">{new Date(e.posted_at).toLocaleString()}</td>
                  <td className="p-4 font-mono text-sm text-gold whitespace-nowrap">{visibleTx(e)}</td>
                  <td className="p-4 text-base">{e.description}</td>
                  <td className="p-4 text-right text-base text-destructive tabular-nums">{Number(e.debit_amount) ? fmt(Number(e.debit_amount)) : "—"}</td>
                  <td className="p-4 text-right text-base text-[var(--success)] tabular-nums">{Number(e.credit_amount) ? fmt(Number(e.credit_amount)) : "—"}</td>
                  <td className="p-4 text-right text-base font-semibold tabular-nums">{e.balance_after == null ? "—" : fmt(Number(e.balance_after))}</td>
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

function AccountLimitsCard({ account, isAdmin }: { account: any; isAdmin: boolean }) {
  const qc = useQueryClient();
  const currency = account.currency_code;
  const accountId = account.id;

  const limitsQ = useQuery({
    queryKey: ["account.limits", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const r: any = await api.accounts.limits(accountId);
        return r ?? null;
      }
      const { data, error } = await supabase.rpc("sp_account_limits", { p_account_id: accountId });
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
  });

  const snap = limitsQ.data;
  const balance = Number(snap?.balance ?? account.current_balance ?? 0);
  const balanceLimit = Number(snap?.balance_limit ?? account.balance_limit ?? 0);
  const creditLimit = Number(snap?.credit_limit ?? account.credit_limit ?? 0);
  const creditUsed = Number(snap?.credit_used ?? account.credit_used ?? 0);
  const spendable = Number(snap?.spendable_balance ?? Math.max(balance - balanceLimit, 0));
  const availCredit = Number(snap?.available_credit ?? Math.max(creditLimit - creditUsed, 0));
  const availWithdraw = Number(snap?.available_to_withdraw ?? spendable + availCredit);
  const overLimit = !!snap?.over_limit || creditUsed > creditLimit;

  const [editing, setEditing] = useState(false);
  const [bl, setBl] = useState(String(balanceLimit));
  const [cl, setCl] = useState(String(creditLimit));
  useEffect(() => {
    setBl(String(balanceLimit));
    setCl(String(creditLimit));
  }, [balanceLimit, creditLimit, accountId]);

  const blNum = Number(bl);
  const clNum = Number(cl);
  const blInvalid = !Number.isFinite(blNum) || blNum < 0;
  const clInvalid = !Number.isFinite(clNum) || clNum < 0;
  const invalid = blInvalid || clInvalid;

  const save = useMutation({
    mutationFn: async () => {
      if (DATA_BACKEND === "lambda") {
        await api.accounts.setLimits(accountId, {
          balance_limit: blNum,
          credit_limit: clNum,
        });
        return;
      }
      const { error } = await supabase.rpc("sp_set_account_limits", {
        p_account_id: accountId,
        p_balance_limit: blNum,
        p_credit_limit: clNum,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limits updated", { duration: 2500 });
      qc.invalidateQueries({ queryKey: ["account.limits", accountId] });
      qc.invalidateQueries({ queryKey: ["account.detail", accountId] });
      qc.invalidateQueries({ queryKey: ["accounts.list"] });
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update limits"),
  });

  return (
    <Card className="card-luxe">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Limits · {currency}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Balance limit protects a minimum customer balance. Credit limit adds revolving capacity beyond the spendable balance.</div>
          </div>
          {isAdmin && !editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 me-1" /> Edit
            </Button>
          ) : null}
          {isAdmin && editing ? (
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setBl(String(balanceLimit)); setCl(String(creditLimit)); }}>
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {isAdmin && editing ? (
          <div className="grid gap-3 sm:grid-cols-2 border-t border-gold/15 pt-4">
            <div>
              <label className="block text-xs text-muted-foreground">Balance limit ({currency})</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={bl}
                onChange={(e) => setBl(e.target.value)}
                className={cn("mt-1", blInvalid && "border-destructive")}
              />
              {blInvalid ? <div className="mt-1 text-[11px] text-destructive">Must be 0 or greater.</div> : (
                <div className="mt-1 text-[11px] text-muted-foreground">Minimum balance to protect before credit is used.</div>
              )}
            </div>
            <div>
              <label className="block text-xs text-muted-foreground">Credit limit ({currency})</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cl}
                onChange={(e) => setCl(e.target.value)}
                className={cn("mt-1", clInvalid && "border-destructive")}
              />
              {clInvalid ? <div className="mt-1 text-[11px] text-destructive">Must be 0 or greater.</div> : (
                <div className="mt-1 text-[11px] text-muted-foreground">Extra amount this customer can withdraw beyond spendable balance.</div>
              )}
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setBl(String(balanceLimit)); setCl(String(creditLimit)); }}>Cancel</Button>
              <Button size="sm" variant="gold" onClick={() => save.mutate()} disabled={save.isPending || invalid}>
                <Check className="h-3.5 w-3.5 me-1" /> Save changes
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t border-gold/15 pt-4">
          <SummaryStat label="Current balance" value={fmt(balance, currency)} />
          <SummaryStat label="Balance limit" value={fmt(balanceLimit, currency)} />
          <SummaryStat label="Spendable balance" value={fmt(spendable, currency)} tone="success" />
          <SummaryStat label="Credit limit" value={fmt(creditLimit, currency)} />
          <SummaryStat label="Credit used" value={fmt(creditUsed, currency)} tone={overLimit ? "danger" : "default"} />
          <SummaryStat label="Available credit" value={fmt(availCredit, currency)} />
          <SummaryStat label="Available to withdraw" value={fmt(availWithdraw, currency)} tone={overLimit ? "danger" : "success"} />
          {overLimit ? (
            <div className="sm:col-span-2 lg:col-span-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              This account is over its credit limit and cannot withdraw until corrected.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "danger" }) {
  const toneCls = tone === "success" ? "text-[var(--success)]" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-sm", toneCls)}>{value}</div>
    </div>
  );
}