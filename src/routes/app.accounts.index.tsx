import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { formatMinor } from "@/lib/format";
import { useDashboardSummary, fmtTotal } from "@/lib/useDashboardSummary";

export const Route = createFileRoute("/app/accounts/")({ component: AccountsList });

const PAGE_SIZE = 100;
const ALLOWED_CURRENCIES = new Set(["LYD", "USD", "EUR", "GBP"]);

function AccountsList() {
  const [offset, setOffset] = useState(0);
  const { data: dashSummary } = useDashboardSummary();

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["holder-accounts.list", offset, PAGE_SIZE],
    queryFn: () => {
      if (DATA_BACKEND !== "lambda") {
        return Promise.resolve({
          items: [] as any[],
          total: 0,
          limit: PAGE_SIZE,
          offset,
          next_offset: null as number | null,
        });
      }
      return api.accounts.list({ limit: PAGE_SIZE, offset });
    },
    placeholderData: keepPreviousData,
  });

  const items: any[] = data?.items ?? [];
  const total = data?.total ?? dashSummary?.holderAccountCount ?? null;
  const start = items.length > 0 ? offset + 1 : 0;
  const end = offset + items.length;
  const nextOffset = data?.next_offset;
  const canPrev = offset > 0;
  const canNext = nextOffset != null && nextOffset > offset && (total == null || nextOffset < total);

  return (
    <div>
      <PageHeader
        title="Linked Accounts"
        description="All holder accounts across DAHAB. Click an account to open its ledger."
      />
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="secondary" className="text-sm">
            Showing {start.toLocaleString()}–{end.toLocaleString()} of {fmtTotal(total)} linked accounts
          </Badge>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev || isFetching}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="h-4 w-4 me-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext || isFetching}
              onClick={() => setOffset(nextOffset ?? offset + PAGE_SIZE)}
            >
              Next <ChevronRight className="h-4 w-4 ms-1" />
            </Button>
          </div>
        </div>

        {isError ? (
          <p className="text-sm text-destructive">
            Failed to load linked accounts: {(error as Error)?.message ?? "unknown error"}
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked accounts found.</p>
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
                      const balanceMinor = a.current_balance_minor ?? a.current_balance ?? 0;
                      const availMinor =
                        a.available_to_withdraw_minor ?? a.available_to_withdraw ?? null;
                      return (
                        <tr
                          key={a.id}
                          className="border-t border-border/40 hover:bg-muted/20"
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
                            {validCur ? formatMinor(Number(balanceMinor) || 0, validCur) : "—"}
                          </td>
                          <td className="px-3 py-2 text-end font-mono">
                            {availMinor != null && validCur
                              ? formatMinor(Number(availMinor) || 0, validCur)
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
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="h-4 w-4 me-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext || isFetching}
              onClick={() => setOffset(nextOffset ?? offset + PAGE_SIZE)}
            >
              Next <ChevronRight className="h-4 w-4 ms-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}