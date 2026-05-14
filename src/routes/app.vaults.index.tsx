import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMinor, formatMinorOrMissing, formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { RoleGate } from "@/components/app/app-shell";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { useDashboardSummary } from "@/lib/useDashboardSummary";
import { isTestRow } from "@/lib/api/_shared";
import {
  EmptyState,
  ErrorState,
  GridLoadingSkeleton,
  TableLoadingSkeleton,
  errorMessage,
} from "@/components/app/state-views";
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
  head: () => ({ meta: [{ title: "Vaults — Dahab" }, { name: "description", content: "Per-currency vault balances, custody movements, and reconciliation." }] }), component: () => (
    <RoleGate allow={["admin", "auditor"]}>
      <VaultsPage />
    </RoleGate>
  ),
});

function VaultsPage() {
  const t = useT();
  const { data: dashSummary } = useDashboardSummary();

  // Currency Cash Vault Summary — net per currency from /dashboard/staff
  // (already net of receivable + payable). Backend is the only allowed
  // source; do not sum vault rows on the client.
  const { data: dashAdmin } = useQuery({
    queryKey: ["vaults.cashByCurrency"],
    enabled: DATA_BACKEND === "lambda",
    queryFn: () => api.dashboard.admin().catch(() => null),
  });
  const cashByCurrency =
    DATA_BACKEND === "lambda"
      ? ((dashAdmin as any)?.cash_by_currency ?? []) as Array<{
          currency: string;
          net_balance_minor: number;
          total_inflow_minor?: number;
          total_outflow_minor?: number;
          transaction_rows?: number;
        }>
      : [];

  const {
    data: vaults = [],
    isLoading: vaultsLoading,
    isError: vaultsIsError,
    error: vaultsError,
    refetch: refetchVaults,
    isFetching: vaultsFetching,
  } = useQuery({
    queryKey: ["vaults.list"],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        // Let errors surface — UI now renders an explicit ErrorState
        // with a retry button instead of a silent empty grid.
        const list = await api.vaults.list();
        const rows = Array.isArray(list) ? list : [];
        const filtered = rows.filter((r: any) => !isTestRow(r));
        // Each official vault account is single-currency. Render 1 row per
        // vault account exactly as the backend returns. Do NOT merge across
        // currencies — Cash Receivable LYD / Cash Payable LYD / etc. are
        // separate vault accounts.
        return filtered.map((r: any) => ({
          id: r.id,
          name: r.name,
          vault_channel: r.vault_channel ?? r.channel ?? r.kind ?? "cash",
          status: r.status ?? (r.is_active === false ? "inactive" : "active"),
          currency_code: r.currency_code,
          internal_role: r.internal_role ?? null,
          balance_minor: Number(r.current_balance ?? 0),
        }));
      }
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, vault_channel, status, account_balances(currency, balance_minor)")
        .eq("kind", "vault");
      if (error) throw error;
      // Supabase fallback path: flatten balances → one row per (vault, currency).
      const out: any[] = [];
      for (const v of data ?? []) {
        for (const b of (v as any).account_balances ?? []) {
          out.push({
            id: `${v.id}:${b.currency}`,
            _vaultId: v.id,
            name: v.name,
            vault_channel: (v as any).vault_channel,
            status: (v as any).status,
            currency_code: b.currency,
            internal_role: null,
            balance_minor: b.balance_minor,
          });
        }
      }
      return out;
    },
  });

  const { data: recentTx = [], isLoading: recentLoading } = useQuery({
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
  // Lambda mode: use /reports/liquidity-health (LYD eq.). Backend applies
  // admin fx_rates — frontend never converts FX.
  const { data: liquidity } = useQuery({
    queryKey: ["vaults.liquidityHealth"],
    enabled: DATA_BACKEND === "lambda",
    queryFn: () => api.reports.liquidityHealth().catch(() => null),
    retry: false,
  });
  const consolidatedAmount =
    DATA_BACKEND === "lambda"
      ? Number(liquidity?.network_total_lyd_minor ?? 0)
      : Number(consolidated?.total_usd_minor ?? 0);
  const consolidatedCurrency: "LYD" | "USD" = DATA_BACKEND === "lambda" ? "LYD" : "USD";
  const consolidatedAvailable =
    DATA_BACKEND === "lambda"
      ? liquidity?.network_total_lyd_minor != null
      : consolidated?.total_usd_minor != null;
  const missingRates =
    DATA_BACKEND === "lambda"
      ? (liquidity?.missing_rates ?? []).map((r: any) => `${r.from}→${r.to}`)
      : consolidated?.missing_rates ?? [];

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
              Consolidated Reserves ({consolidatedCurrency} eq.)
            </p>
            <div className="font-serif text-3xl font-semibold tabular-nums text-foreground">
              {consolidatedAvailable ? formatMinor(consolidatedAmount, consolidatedCurrency) : "—"}
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

      {/* Currency Cash Vault Summary — net per currency from backend.
          Receivable + payable are grouped by currency_code. The underlying
          official vault accounts still appear in the grid below. */}
      {cashByCurrency.length > 0 && (
        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Currency Cash Vault Summary
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cashByCurrency.map((row) => {
              const ccy = row.currency;
              const receivableCount = vaults.filter(
                (v: any) =>
                  v.currency_code === ccy && /receiv/i.test(String(v.internal_role ?? "")),
              ).length;
              const payableCount = vaults.filter(
                (v: any) =>
                  v.currency_code === ccy && /pay/i.test(String(v.internal_role ?? "")),
              ).length;
              return (
                <a key={ccy} href={`#vault-ccy-${ccy || "missing"}`} className="block">
                <Card className="p-5 transition-all hover:border-gold/50 hover:shadow-lg cursor-pointer">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {ccy || "Currency missing"}
                    </Badge>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Currency cash vault
                    </span>
                  </div>
                  <div className="font-mono text-xl font-semibold tabular-nums text-foreground">
                    {formatMinorOrMissing(Number(row.net_balance_minor) || 0, ccy)}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Net balance (receivable + payable)
                  </div>
                  {(row.total_inflow_minor != null ||
                    row.total_outflow_minor != null ||
                    row.transaction_rows != null) && (
                    <div className="mt-3 space-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
                      {row.total_inflow_minor != null && (
                        <div className="flex justify-between">
                          <span>Inflow</span>
                          <span className="tabular-nums text-foreground">
                            {formatMinorOrMissing(Number(row.total_inflow_minor), ccy)}
                          </span>
                        </div>
                      )}
                      {row.total_outflow_minor != null && (
                        <div className="flex justify-between">
                          <span>Outflow</span>
                          <span className="tabular-nums text-foreground">
                            {formatMinorOrMissing(Number(row.total_outflow_minor), ccy)}
                          </span>
                        </div>
                      )}
                      {row.transaction_rows != null && (
                        <div className="flex justify-between">
                          <span>Transactions</span>
                          <span className="tabular-nums text-foreground">
                            {row.transaction_rows}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
                    <span>Receivable accounts: {receivableCount}</span>
                    <span>Payable accounts: {payableCount}</span>
                  </div>
                </Card>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Vault grid — one card per single-currency official vault account */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Official Vault Accounts
          {dashSummary?.vaultCount != null && (
            <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
              · Showing {vaults.length} of {dashSummary.vaultCount}
            </span>
          )}
        </h2>
        {vaultsLoading ? (
          <GridLoadingSkeleton cards={6} />
        ) : vaultsIsError ? (
          <ErrorState
            title="Couldn't load vaults"
            description={errorMessage(vaultsError, "The vaults service did not respond.")}
            onRetry={() => refetchVaults()}
            retrying={vaultsFetching}
          />
        ) : vaults.length === 0 ? (
          <EmptyState
            title="No vaults yet"
            description="Vault accounts created by the back office will appear here."
            icon={Landmark}
          />
        ) : (() => {
          const groups = new Map<string, any[]>();
          for (const v of vaults as any[]) {
            const key = v.currency_code ?? "__missing__";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(v);
          }
          const entries = Array.from(groups.entries()).sort(([a], [b]) => {
            if (a === "__missing__") return 1;
            if (b === "__missing__") return -1;
            return 0;
          });
          return (
            <div className="space-y-6">
              {entries.map(([ccy, items]) => {
                const validCcy = ccy !== "__missing__";
                return (
                  <section
                    key={ccy}
                    id={`vault-ccy-${validCcy ? ccy : "missing"}`}
                    className="scroll-mt-24"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase tracking-wider ${
                          validCcy ? "" : "border-destructive/40 text-destructive"
                        }`}
                      >
                        {validCcy ? ccy : "Currency missing"}
                      </Badge>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        · {items.length} account{items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {items.map((v: any, i: number) => {
                        const Icon = v.vault_channel === "cash" ? Banknote : Building2;
                        const role = (v.internal_role ?? "").toString();
                        const isReceivable = /receiv/i.test(role);
                        const isPayable = /pay/i.test(role);
                        const roleLabel = isReceivable
                          ? "Cash Receivable"
                          : isPayable
                          ? "Cash Payable"
                          : role || "Vault";
                        return (
                          <motion.div
                            key={v.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                          >
                            <Link
                              to="/app/vaults/$id"
                              params={{ id: String(v._vaultId ?? v.id) }}
                              search={{}}
                              className="block h-full"
                            >
                              <Card className="group relative h-full overflow-hidden p-5 transition-all hover:border-gold/50 hover:shadow-lg">
                                <div className="pointer-events-none absolute -right-4 -top-4 opacity-[0.06] transition-all duration-500 group-hover:scale-110 group-hover:opacity-10">
                                  <Landmark className="h-28 w-28 text-gold" />
                                </div>
                                <div className="relative z-10 flex h-full flex-col">
                                  <div className="mb-4 flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
                                        <Icon className="h-5 w-5 text-gold" />
                                      </div>
                                      <div className="min-w-0">
                                        <span className="block truncate text-sm font-medium text-foreground">
                                          {v.name}
                                        </span>
                                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                                          {roleLabel} · {v.vault_channel}
                                        </span>
                                      </div>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] uppercase tracking-wider ${
                                        v.currency_code ? "" : "border-destructive/40 text-destructive"
                                      }`}
                                    >
                                      {v.currency_code ?? "Currency missing"}
                                    </Badge>
                                  </div>

                                  <div className="mt-auto flex items-end justify-between border-t border-border pt-4">
                                    <div>
                                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        Balance
                                      </div>
                                      <div className="font-mono text-lg font-semibold tabular-nums text-foreground">
                                        {v.currency_code
                                          ? formatMinor(v.balance_minor, v.currency_code)
                                          : "—"}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-gold">
                                      {t("vaults.viewTx")}
                                      <ArrowRight className="h-4 w-4" />
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          );
        })()}
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
                {recentLoading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                      Loading recent activity…
                    </td>
                  </tr>
                ) : recentTx.length === 0 ? (
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
                          {tx.currency ? (
                            <>
                              {intoVault ? "+" : "−"}
                              {formatMinor(tx.amount_minor, tx.currency)}
                            </>
                          ) : (
                            <span
                              className="text-destructive"
                              title="Currency missing on backend row"
                            >
                              Currency missing
                            </span>
                          )}
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