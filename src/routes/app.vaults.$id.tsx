import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
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

type VaultSearch = { currency?: "USD" | "EUR" | "LYD" };

export const Route = createFileRoute("/app/vaults/$id")({
  component: VaultDetail,
  validateSearch: (search: Record<string, unknown>): VaultSearch => {
    const c = search.currency;
    if (c === "USD" || c === "EUR" || c === "LYD") return { currency: c };
    return {};
  },
});

function VaultDetail() {
  const t = useT();
  const { id } = Route.useParams();
  const { currency } = Route.useSearch();
  const [search, setSearch] = useState("");

  const { data: vault } = useQuery({
    queryKey: ["vault.detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, vault_channel, status, account_balances(currency, balance_minor)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: tx } = useQuery({
    queryKey: ["vault.tx", id, currency ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, customer_account_id, accounts:customer_account_id(name, account_number)")
        .eq("vault_account_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (currency) q = q.eq("currency", currency);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const ChannelIcon = vault?.vault_channel === "cash" ? Banknote : Building2;

  // 30-day inflow / outflow for selected currency (or all)
  const flow = useMemo(() => {
    const list = (tx ?? []) as any[];
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    let inMinor = 0;
    let outMinor = 0;
    for (const r of list) {
      if (new Date(r.created_at).getTime() < cutoff) continue;
      if (r.status !== "posted") continue;
      if (r.direction === "withdraw") inMinor += r.amount_minor;
      else if (r.direction === "deposit") outMinor += r.amount_minor;
    }
    return { inMinor, outMinor };
  }, [tx]);

  // Filter by search reference
  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return (tx ?? []) as any[];
    return ((tx ?? []) as any[]).filter(
      (r) =>
        r.tx_number?.toLowerCase().includes(q) ||
        r.comment?.toLowerCase().includes(q) ||
        r.accounts?.name?.toLowerCase().includes(q),
    );
  }, [tx, search]);

  const totalBalanceMinor =
    vault?.account_balances?.find((x: any) => x.currency === currency)?.balance_minor ?? 0;
  const heroCurrency = currency ?? "USD";

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
                {currency ? <span className="text-muted-foreground"> · {currency}</span> : null}
              </h1>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-gold" />
              Secure {vault?.vault_channel} reserve · {vault?.status}
            </p>
          </div>
          {currency ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/app/vaults/$id" params={{ id }} search={{}}>
                {t("vaults.viewAllCurrencies")}
              </Link>
            </Button>
          ) : null}
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
                {currency ? `Reserve Balance · ${currency}` : "Reserve Balances"}
              </p>
              {currency ? (
                <div className="mb-4 font-serif text-4xl font-semibold tabular-nums tracking-tight text-foreground md:text-5xl">
                  {formatMinor(totalBalanceMinor, currency)}
                </div>
              ) : (
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  {(["USD", "EUR", "LYD"] as const).map((c) => {
                    const b = vault?.account_balances?.find((x: any) => x.currency === c)?.balance_minor ?? 0;
                    return (
                      <Link
                        key={c}
                        to="/app/vaults/$id"
                        params={{ id }}
                        search={{ currency: c }}
                        className="rounded-lg border border-border bg-background/50 p-4 transition-all hover:border-gold/50 hover:bg-gold/5"
                      >
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          {c}
                        </div>
                        <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
                          {formatMinor(b, c)}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
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
                  <th className="px-5 py-3 font-medium">Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTx.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  filteredTx.map((r: any) => {
                    const intoVault = r.direction === "withdraw";
                    const Icon =
                      r.direction === "deposit"
                        ? ArrowUpFromLine
                        : r.direction === "withdraw"
                        ? ArrowDownToLine
                        : ArrowRightLeft;
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
                                : r.direction === "deposit"
                                ? "border-destructive/30 bg-destructive/10 text-destructive"
                                : "border-border bg-muted text-muted-foreground"
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            {r.direction}
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
                          {formatMinor(r.amount_minor, r.currency)}
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
                            {r.status}
                          </Badge>
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