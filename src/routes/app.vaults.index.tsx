import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMinor, formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { RoleGate } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { useDashboardSummary } from "@/lib/useDashboardSummary";
import {
  Landmark,
  Banknote,
  Building2,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  ShieldCheck,
  Activity,
  ArrowRight,
  PieChart,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/app/vaults/")({
  component: () => (
    <RoleGate allow={["admin", "auditor"]}>
      <VaultsPage />
    </RoleGate>
  ),
});

const CURRENCIES = ["USD", "EUR", "LYD"] as const;

function VaultsPage() {
  const t = useT();
  const { data: dashSummary } = useDashboardSummary();

  const { data: vaults = [] } = useQuery({
    queryKey: ["vaults.list"],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const list = await api.vaults.list().catch(() => [] as any[]);
        const rows = Array.isArray(list) ? list : [];
        // Group by vault id; backend may return one row per (vault, currency).
        const byId = new Map<string, any>();
        for (const r of rows) {
          const key = String(r.id);
          if (!byId.has(key)) {
            byId.set(key, {
              id: r.id,
              name: r.name,
              vault_channel: r.vault_channel ?? r.channel ?? r.kind ?? "cash",
              status: r.status ?? (r.is_active === false ? "inactive" : "active"),
              account_balances: [] as Array<{ currency: string; balance_minor: number }>,
            });
          }
          if (r.currency_code != null && r.current_balance != null) {
            byId.get(key).account_balances.push({
              currency: r.currency_code,
              balance_minor: Number(r.current_balance) || 0,
            });
          }
        }
        return Array.from(byId.values());
      }
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, vault_channel, status, account_balances(currency, balance_minor)")
        .eq("kind", "vault");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: recentTx = [] } = useQuery({
    queryKey: ["vaults.recentActivity"],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const list = await api.transactions.list({ limit: 8 }).catch(() => [] as any[]);
        return (Array.isArray(list) ? list : []).map((r: any) => ({
          id: r.id,
          tx_number: r.tx_number,
          direction: r.direction,
          currency: r.currency ?? r.currency_code,
          amount_minor: Number(r.amount_minor ?? 0),
          status: r.status,
          created_at: r.created_at ?? r.posted_at,
          vault_account_id: r.vault_account_id ?? null,
          accounts: null,
        }));
      }
      const { data, error } = await supabase
        .from("transactions")
        .select("id, tx_number, direction, currency, amount_minor, status, created_at, vault_account_id, accounts:vault_account_id(name, vault_channel)")
        .not("vault_account_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Consolidated USD-equivalent reserves — sourced from the database (fx_rates).
  const { data: consolidated } = useQuery({
    queryKey: ["vaults.consolidatedUsd"],
    enabled: DATA_BACKEND !== "lambda",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_consolidated_usd");
      if (error) throw error;
      return data as {
        total_usd_minor: number;
        breakdown: Array<{ currency: string; usd_rate: number | null; rate_date: string | null }>;
        missing_rates: string[];
        computed_at: string;
      };
    },
  });
  const consolidatedUsd = Number(consolidated?.total_usd_minor ?? 0);
  const missingRates = consolidated?.missing_rates ?? [];

  return (
    <div className="space-y-8 p-4 pb-12 sm:p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
            {t("vaults.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor and manage cash and bank reserves across every currency.
          </p>
        </div>
      </div>

      {/* Insight strip */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        <Card className="relative overflow-hidden border-gold/30 bg-gradient-to-br from-gold/5 via-background to-background p-6">
          <div className="absolute -right-6 -top-6 opacity-10">
            <PieChart className="h-32 w-32 text-gold" />
          </div>
          <div className="relative z-10">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Consolidated Reserves (USD eq.)
            </p>
            <div className="font-serif text-3xl font-semibold tabular-nums text-foreground">
              {formatMinor(consolidatedUsd, "USD")}
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-success">
              <TrendingUp className="h-3 w-3" /> Across {vaults.length} vaults
            </div>
            {missingRates.length > 0 && (
              <div className="mt-2 text-[11px] text-warning">
                Missing FX rate: {missingRates.join(", ")} ·{" "}
                <Link to="/app/admin/fx-rates" className="underline hover:text-gold">
                  Set rates
                </Link>
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col justify-center p-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recent Activity
            </p>
            <Activity className="h-4 w-4 text-gold" />
          </div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {recentTx.length}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Latest postings across vaults</p>
        </Card>

        <Card className="flex flex-col justify-center p-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Active Vaults
            </p>
            <ShieldCheck className="h-4 w-4 text-success" />
          </div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {dashSummary?.vaultCount ?? vaults.length}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {dashSummary?.vaultCount != null && dashSummary.vaultCount !== vaults.length
              ? `Showing ${vaults.length} of ${dashSummary.vaultCount}`
              : "All systems operational"}
          </p>
        </Card>
      </motion.div>

      {/* Vault grid */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Reserve Vaults
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vaults.map((v: any, i: number) => {
            const Icon = v.vault_channel === "cash" ? Banknote : Building2;
            return (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="group relative h-full overflow-hidden p-5 transition-all hover:border-gold/50 hover:shadow-lg">
                  <div className="pointer-events-none absolute -right-4 -top-4 opacity-[0.06] transition-all duration-500 group-hover:scale-110 group-hover:opacity-10">
                    <Landmark className="h-28 w-28 text-gold" />
                  </div>
                  <div className="relative z-10 flex h-full flex-col">
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
                          <Icon className="h-5 w-5 text-gold" />
                        </div>
                        <div>
                          <span className="block truncate text-sm font-medium text-foreground">
                            {v.name}
                          </span>
                          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                            {v.vault_channel} reserve
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {v.status}
                      </Badge>
                    </div>

                    <ul className="mt-auto divide-y divide-border">
                      {CURRENCIES.map((c) => {
                        const b = v.account_balances?.find((x: any) => x.currency === c)?.balance_minor ?? 0;
                        return (
                          <li key={c}>
                            <Link
                              to="/app/vaults/$id"
                              params={{ id: v.id }}
                              search={{ currency: c }}
                              className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-gold"
                            >
                              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/50 text-[10px] font-semibold uppercase tracking-wider">
                                {c}
                              </span>
                              <span className="flex-1 text-xs text-muted-foreground">
                                {t("vaults.viewTx")}
                              </span>
                              <span className="font-mono font-semibold tabular-nums">
                                {formatMinor(b, c)}
                              </span>
                              <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:text-gold" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 p-5">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-gold" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Global Vault Activity
              </h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/transactions">View all</Link>
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Vault</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentTx.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                      No vault activity yet.
                    </td>
                  </tr>
                ) : (
                  recentTx.map((tx: any) => {
                    const intoVault = tx.direction === "withdraw";
                    const Icon =
                      tx.direction === "deposit"
                        ? ArrowUpFromLine
                        : tx.direction === "withdraw"
                        ? ArrowDownToLine
                        : ArrowRightLeft;
                    return (
                      <tr key={tx.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {formatDateTime(tx.created_at)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded border border-gold/30 bg-gold/10">
                              <Landmark className="h-3 w-3 text-gold" />
                            </div>
                            <span className="text-xs font-medium">
                              {tx.accounts?.name ?? "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${
                              tx.direction === "withdraw"
                                ? "border-success/30 bg-success/10 text-success"
                                : tx.direction === "deposit"
                                ? "border-destructive/30 bg-destructive/10 text-destructive"
                                : "border-border bg-muted text-muted-foreground"
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            {tx.direction}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">{tx.tx_number}</td>
                        <td
                          className={`px-5 py-3 text-right font-mono font-semibold tabular-nums ${
                            intoVault ? "text-success" : "text-destructive"
                          }`}
                        >
                          {intoVault ? "+" : "−"}
                          {formatMinor(tx.amount_minor, tx.currency)}
                        </td>
                        <td className="px-5 py-3">
                          <Badge
                            variant={
                              tx.status === "posted"
                                ? "secondary"
                                : tx.status === "pending"
                                ? "outline"
                                : "destructive"
                            }
                          >
                            {tx.status}
                          </Badge>
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