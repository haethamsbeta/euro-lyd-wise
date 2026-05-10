import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatMinor, formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import {
  ArrowLeft,
  Banknote,
  Building2,
  Landmark,
  ShieldCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  Search,
  Download,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { RoleGate } from "@/components/app/app-shell";
import { REALTIME_MODE, POLL_INTERVALS } from "@/lib/runtimeConfig";

export const Route = createFileRoute("/app/vaults/$id")({
  component: () => (
    <RoleGate allow={["admin", "auditor"]}>
      <VaultDetail />
    </RoleGate>
  ),
  validateSearch: (_search: Record<string, unknown>) => ({}),
});

function VaultDetail() {
  const t = useT();
  const { id } = Route.useParams();
  const [search, setSearch] = useState("");

  const { data: vault } = useQuery({
    queryKey: ["vault.detail", id],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const v: any = await api.vaults.get(id).catch(() => null);
        if (!v) return null;
        return {
          id: v.id,
          name: v.name,
          vault_channel: v.vault_channel ?? v.channel ?? v.kind ?? "cash",
          status: v.status ?? (v.is_active === false ? "inactive" : "active"),
          currency_code: v.currency_code,
          internal_role: v.internal_role ?? null,
          balance_minor: Number(v.current_balance ?? 0),
        };
      }
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, vault_channel, status, account_balances(currency, balance_minor)")
        .eq("id", id)
        .single();
      if (error) throw error;
      const first = (data as any)?.account_balances?.[0];
      return {
        id: (data as any).id,
        name: (data as any).name,
        vault_channel: (data as any).vault_channel,
        status: (data as any).status,
        currency_code: first?.currency ?? null,
        internal_role: null,
        balance_minor: first?.balance_minor ?? 0,
      };
    },
  });

  const { data: tx, isError: txError } = useQuery({
    queryKey: ["vault.tx", id],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const rows = await api.vaults
          .recentActivity(id, { limit: 200 })
          .catch(() => null);
        if (!Array.isArray(rows)) return null; // treat as endpoint pending
        return rows.map((r: any) => ({
          id: r.id,
          tx_number: r.tx_number,
          created_at: r.posted_at,
          comment: r.description,
          debit_minor: Number(r.debit_minor ?? 0),
          credit_minor: Number(r.credit_minor ?? 0),
          balance_after: Number(r.balance_after_minor ?? 0),
          currency: vault?.currency_code,
          status: "posted",
          direction: Number(r.debit_minor ?? 0) > 0 ? "deposit" : "withdraw",
          accounts: null,
        }));
      }
      const { data, error } = await supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, customer_account_id, accounts:customer_account_id(name, account_number)")
        .eq("vault_account_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    refetchInterval: REALTIME_MODE === "polling" ? POLL_INTERVALS.vaultActivity : false,
    enabled: !!vault,
  });

  const ChannelIcon = vault?.vault_channel === "cash" ? Banknote : Building2;
  const currency = vault?.currency_code ?? "USD";
  const activityPending = tx === null;

  // 30-day inflow / outflow
  const flow = useMemo(() => {
    const list = (Array.isArray(tx) ? tx : []) as any[];
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    let inMinor = 0;
    let outMinor = 0;
    for (const r of list) {
      if (new Date(r.created_at).getTime() < cutoff) continue;
      if (r.status && r.status !== "posted") continue;
      const debit = Number(r.debit_minor ?? (r.direction === "deposit" ? r.amount_minor : 0)) || 0;
      const credit = Number(r.credit_minor ?? (r.direction === "withdraw" ? r.amount_minor : 0)) || 0;
      inMinor += debit;
      outMinor += credit;
    }
    return { inMinor, outMinor };
  }, [tx]);

  // Single-currency vault — prefer backend-provided balance_after; fall back
  // to running compute if missing.
  const txWithBalance = useMemo(() => {
    const list = (Array.isArray(tx) ? tx : []).slice() as any[];
    if (list.length && list[0].balance_after != null) {
      return list.map((r) => ({ ...r, _counted: true }));
    }
    const sorted = list.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    let running = 0;
    const enriched = sorted.map((r) => {
      const counts = !r.status || r.status === "posted";
      const debit = Number(r.debit_minor ?? (r.direction === "deposit" ? r.amount_minor : 0)) || 0;
      const credit = Number(r.credit_minor ?? (r.direction === "withdraw" ? r.amount_minor : 0)) || 0;
      if (counts) running += debit - credit;
      return { ...r, balance_after: running, _counted: counts };
    });
    return enriched.reverse();
  }, [tx]);

  // Filter by search reference
  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return txWithBalance;
    return txWithBalance.filter(
      (r) =>
        r.tx_number?.toLowerCase().includes(q) ||
        r.comment?.toLowerCase().includes(q) ||
        r.accounts?.name?.toLowerCase().includes(q),
    );
  }, [txWithBalance, search]);

  const totalBalanceMinor = vault?.balance_minor ?? 0;
  const heroCurrency = currency;

  return (
    <div className="space-y-6 p-4 pb-12 sm:p-6">
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-4">
        <Link
          to="/app/vaults"
          className="inline-flex w-fit items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Vaults
        </Link>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
                <ChannelIcon className="h-5 w-5 text-gold" />
              </div>
              <h1 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
                {vault?.name ?? "Vault"}
              {vault?.currency_code ? (
                <span className="text-muted-foreground"> · {vault.currency_code}</span>
              ) : null}
              </h1>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-gold" />
            {vault?.internal_role ? `${vault.internal_role} · ` : ""}
            Secure {vault?.vault_channel} reserve · {vault?.status}
            </p>
          </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/app/vaults">Back to all vaults</Link>
        </Button>
        </div>
      </div>

      {/* Hero */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2"
        >
          <Card className="relative h-full overflow-hidden border-gold/30 bg-gradient-to-br from-gold/5 via-background to-background p-8">
            <div className="absolute right-0 top-0 p-8 opacity-[0.05]">
              <Landmark className="h-48 w-48 text-gold" />
            </div>
            <div className="relative z-10">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Reserve Balance · {currency}
              </p>
            <div className="mb-4 font-serif text-4xl font-semibold tabular-nums tracking-tight text-foreground md:text-5xl">
              {formatMinor(totalBalanceMinor, currency)}
            </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-gold" />
                  Read-only — moves only via posted transactions
                </span>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-rows-2 gap-4"
        >
          <Card className="flex flex-col justify-center p-5">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                30-Day Inflow
              </p>
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums text-success">
              +{formatMinor(flow.inMinor, heroCurrency)}
            </div>
          </Card>
          <Card className="flex flex-col justify-center p-5">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                30-Day Outflow
              </p>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums text-destructive">
              −{formatMinor(flow.outMinor, heroCurrency)}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Ledger */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col justify-between gap-4 border-b border-border bg-muted/30 p-5 sm:flex-row sm:items-center">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Vault Ledger
            </h2>
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search reference..."
                  className="h-9 pl-9 text-sm"
                />
              </div>
              <Button variant="outline" size="sm" className="h-9 px-3" disabled>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] whitespace-nowrap text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">TX #</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">
                    Balance after{currency ? "" : " (per currency)"}
                  </th>
                  <th className="px-5 py-3 font-medium">Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activityPending ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                      Backend endpoint pending — vault activity will appear once the API is live.
                    </td>
                  </tr>
                ) : filteredTx.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  filteredTx.map((r: any) => {
                    const debit = Number(r.debit_minor ?? 0);
                    const credit = Number(r.credit_minor ?? 0);
                    const intoVault = debit >= credit;
                    const Icon =
                      intoVault ? ArrowDownToLine : ArrowUpFromLine;
                    const amountMinor = intoVault ? debit || r.amount_minor : credit || r.amount_minor;
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {formatDateTime(r.created_at)}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">{r.tx_number}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${
                              intoVault
                                ? "border-success/30 bg-success/10 text-success"
                                : "border-destructive/30 bg-destructive/10 text-destructive"
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            {intoVault ? "in" : "out"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {r.accounts ? (
                            <span>
                              {r.accounts.name}{" "}
                              <span className="text-xs text-muted-foreground">
                                #{r.accounts.account_number}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-mono font-semibold tabular-nums ${
                            intoVault ? "text-success" : "text-destructive"
                          }`}
                        >
                          {intoVault ? "+" : "−"}
                          {formatMinor(amountMinor, r.currency ?? currency)}
                        </td>
                        <td className="px-5 py-3">
                          <Badge
                            variant={
                              r.status === "posted"
                                ? "secondary"
                                : r.status === "pending"
                                ? "outline"
                                : "destructive"
                            }
                          >
                            {r.status ?? "posted"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums">
                          {r._counted
                            ? formatMinor(r.balance_after, r.currency ?? currency)
                            : "—"}
                        </td>
                        <td className="max-w-sm truncate px-5 py-3 text-muted-foreground">
                          {r.comment}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}