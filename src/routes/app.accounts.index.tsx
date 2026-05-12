import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { useDebounced } from "@/hooks/use-debounced";
import { useDashboardSummary, fmtTotal } from "@/lib/useDashboardSummary";
import { isTestRow } from "@/lib/api/_shared";

export const Route = createFileRoute("/app/accounts/")({ component: AccountsList });

const ALLOWED_CURRENCIES = new Set(["LYD", "USD", "EUR", "GBP"]);
const PAGE_SIZES = [50, 100] as const;

function fmtAmount(n: number, currency: string) {
  return `${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function AccountsList() {
  const navigate = useNavigate();
  const [pageSize, setPageSize] = useState<number>(50);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [currency, setCurrency] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { data: dashSummary } = useDashboardSummary();

  // Reset offset whenever search/filter/page-size changes.
  useEffect(() => {
    setOffset(0);
  }, [dq, currency, status, pageSize]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["holder-accounts.list", offset, pageSize, dq, currency, status],
    queryFn: () => {
      if (DATA_BACKEND !== "lambda") {
        return Promise.resolve({
          items: [] as any[],
          total: 0,
          limit: pageSize,
          offset,
          next_offset: null as number | null,
        });
      }
      return api.holderAccounts.list({
        limit: pageSize,
        offset,
        q: dq.trim() || undefined,
        currency: currency ?? undefined,
        status: status ?? undefined,
      });
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (isError && import.meta.env.DEV) {
      const e = error as any;
      // eslint-disable-next-line no-console
      console.warn("[/app/accounts] /holder-accounts failed", {
        message: e?.message,
        status: e?.status,
        details: e?.details,
      });
    }
  }, [isError, error]);

  const hasFilters = !!(dq.trim() || currency || status);

  const items: any[] = (data?.items ?? []).filter((r: any) => !isTestRow(r));
  const total = data?.total ?? dashSummary?.holderAccountCount ?? null;
  const start = items.length > 0 ? offset + 1 : 0;
  const end = offset + items.length;
  const nextOffset = data?.next_offset;
  const canPrev = offset > 0;
  const canNext =
    nextOffset != null
      ? nextOffset > offset && (total == null || nextOffset < total)
      : items.length === pageSize && (total == null || end < total);
  const goNext = () => setOffset(nextOffset ?? offset + pageSize);
  const goPrev = () => setOffset(Math.max(0, offset - pageSize));

  return (
    <div>
      <PageHeader
        title="Linked Accounts"
        description="All holder accounts across DAHAB. Click an account to open its ledger."
      />
      <div className="space-y-4 p-4 sm:p-6">
        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by holder, DAHAB #, account #, alias, phone…"
              className="ps-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrency(null)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${!currency ? "border-gold text-gold" : "text-muted-foreground"}`}
            >
              All currencies
            </button>
            {(["LYD", "USD", "EUR", "GBP"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(currency === c ? null : c)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${currency === c ? "border-gold text-gold" : "text-muted-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatus(null)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${!status ? "border-gold text-gold" : "text-muted-foreground"}`}
            >
              Any status
            </button>
            {(["active", "closed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(status === s ? null : s)}
                className={`rounded-full border px-2.5 py-0.5 text-xs capitalize ${status === s ? "border-gold text-gold" : "text-muted-foreground"}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Page size</span>
            {PAGE_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPageSize(n)}
                className={`rounded-full border px-2 py-0.5 ${pageSize === n ? "border-gold text-gold" : ""}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="secondary" className="text-sm">
            Showing {start.toLocaleString()}–{end.toLocaleString()} of {fmtTotal(total)} linked accounts
          </Badge>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev || isFetching}
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4 me-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext || isFetching}
              onClick={goNext}
            >
              Next <ChevronRight className="h-4 w-4 ms-1" />
            </Button>
          </div>
        </div>

        {isError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Unable to load accounts right now. Please refresh.
                </p>
                <p className="text-xs text-muted-foreground">
                  {((error as any)?.message ?? "unknown error").toString().slice(0, 200)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`me-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "No accounts match your filters." : "No linked accounts yet."}
          </p>
        ) : (
          <Card className="card-luxe">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-start">Holder</th>
                      <th className="px-3 py-2 text-start">Account</th>
                      <th className="px-3 py-2 text-start">Display Name</th>
                      <th className="px-3 py-2 text-start">Currency</th>
                      <th className="px-3 py-2 text-start">Nature</th>
                      <th className="px-3 py-2 text-end">Balance</th>
                      <th className="px-3 py-2 text-end">Available</th>
                      <th className="px-3 py-2 text-start">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a: any) => {
                      const rawCur: string | null | undefined = a.currency_code ?? a.currency;
                      const cur = rawCur ? String(rawCur).toUpperCase() : null;
                      const validCur = cur && ALLOWED_CURRENCIES.has(cur) ? cur : null;
                      const balance = Number(
                        a.current_balance_minor != null
                          ? Number(a.current_balance_minor) / 100
                          : a.current_balance ?? 0,
                      );
                      const avail =
                        a.available_to_withdraw_minor != null
                          ? Number(a.available_to_withdraw_minor) / 100
                          : a.available_to_withdraw_amount ?? a.available_to_withdraw ?? null;
                      return (
                        <tr
                          key={a.id}
                          className="cursor-pointer border-t border-border/40 hover:bg-muted/20"
                          onClick={() =>
                            navigate({ to: "/app/accounts/$id", params: { id: String(a.id) } })
                          }
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium" dir="auto">
                              {a.holder_name ?? "—"}
                            </div>
                            {a.holder_dahab_account_number && (
                              <div className="font-mono text-[11px] text-gold">
                                {a.holder_dahab_account_number}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              to="/app/accounts/$id"
                              params={{ id: String(a.id) }}
                              className="font-mono text-xs text-foreground hover:text-gold"
                            >
                              {a.account_number ?? "—"}
                            </Link>
                            {a.dahab_account_number && a.dahab_account_number !== a.account_number && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {a.dahab_account_number}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2" dir="auto">
                            {a.account_display_name ?? a.alias_name ?? "—"}
                            {typeof a.linked_ledger_count === "number" && (
                              <div className="text-[10px] text-muted-foreground">
                                {a.linked_ledger_count.toLocaleString()} ledger entries
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {validCur ? (
                              <CurrencyBadge currency={validCur} />
                            ) : (
                              <span
                                className="text-[10px] uppercase tracking-wider text-destructive"
                                title="Currency missing from backend"
                              >
                                Missing currency
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {a.account_nature ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-end font-mono">
                            {validCur ? fmtAmount(balance, validCur) : "—"}
                          </td>
                          <td className="px-3 py-2 text-end font-mono">
                            {avail != null && validCur
                              ? fmtAmount(Number(avail) || 0, validCur)
                              : "—"}
                            {a.withdraw_limit_enabled && (
                              <div className="text-[10px] text-muted-foreground">limit on</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className="text-xs">
                              {a.status ?? "—"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev || isFetching}
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4 me-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext || isFetching}
              onClick={goNext}
            >
              Next <ChevronRight className="h-4 w-4 ms-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}