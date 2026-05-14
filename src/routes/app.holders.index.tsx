import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus } from "lucide-react";
import { useDebounced } from "@/hooks/use-debounced";
import { Button } from "@/components/ui/button";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { useT } from "@/lib/i18n";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { useDashboardSummary, fmtTotal } from "@/lib/useDashboardSummary";
import {
  EmptyState,
  ErrorState,
  GridLoadingSkeleton,
  errorMessage,
} from "@/components/app/state-views";

export const Route = createFileRoute("/app/holders/")({ head: () => ({ meta: [{ title: "Account holders — Dahab" }, { name: "description", content: "Browse all Dahab account holders, families, and businesses on file." }] }), component: HoldersList });

function HoldersList() {
  const [q, setQ] = useState("");
  const t = useT();
  const dq = useDebounced(q, 250);
  const PAGE_SIZE = 50;
  const roles = useEffectiveRoles();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const { data: dashSummary } = useDashboardSummary();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["holders.list", dq, PAGE_SIZE],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const paged = await api.holders.listPaged({
          q: dq.trim() || undefined,
          limit: PAGE_SIZE,
          offset: 0,
        });
        const rows = paged.items ?? [];
        return {
          total: paged.total ?? rows.length,
          items: rows.map((h: any) => ({
          id: h.id,
          dahab_account_number: h.dahab_account_number,
          canonical_name: h.holder_name ?? h.canonical_name,
          normalized_name: h.normalized_name ?? null,
          status: h.status ?? "active",
          phone: h.phone ?? null,
          email: h.email ?? null,
          created_at: h.created_at ?? null,
          linked_account_count:
            typeof h.linked_account_count === "number" ? h.linked_account_count : null,
          holder_accounts: (h.holder_accounts ?? h.accounts ?? []).map((a: any) => ({
            id: a.id,
            currency_code: a.currency_code ?? a.currency,
            account_number: a.account_number,
            account_display_name: a.account_display_name ?? a.alias_name ?? "",
          })),
          })),
        };
      }
      const term = dq.trim();
      if (term) {
        // Search across holders + linked accounts
        const [byHolder, byAccount] = await Promise.all([
          supabase
            .from("account_holders")
            .select("id,dahab_account_number,canonical_name,normalized_name,status,phone,email,created_at,holder_accounts(id,currency_code,account_number,account_display_name)")
            .or(`canonical_name.ilike.%${term}%,normalized_name.ilike.%${term}%,dahab_account_number.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
            .range(0, PAGE_SIZE - 1),
          supabase
            .from("holder_accounts")
            .select("account_holder_id, account_holders!inner(id,dahab_account_number,canonical_name,normalized_name,status,phone,email,created_at,holder_accounts(id,currency_code,account_number,account_display_name))")
            .or(`account_number.ilike.%${term}%,account_display_name.ilike.%${term}%`)
            .limit(PAGE_SIZE),
        ]);
        if (byHolder.error) throw byHolder.error;
        if (byAccount.error) throw byAccount.error;
        const map = new Map<number, any>();
        for (const h of byHolder.data ?? []) map.set(h.id, h);
        for (const a of byAccount.data ?? []) {
          const h: any = (a as any).account_holders;
          if (h) map.set(h.id, h);
        }
        const items = Array.from(map.values());
        return { items, total: items.length };
      }
      const { data, error, count } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,normalized_name,status,phone,email,created_at,holder_accounts(id,currency_code,account_number,account_display_name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1);
      if (error) throw error;
      return { items: data ?? [], total: count ?? (data?.length ?? 0) };
    },
  });

  const items = (data?.items ?? []) as any[];
  const filtered = items;

  return (
    <div>
      <PageHeader
        title={t("holders.title")}
        description={t("holders.subtitle")}
        actions={
          isAdmin ? (
            <Button asChild className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
              <Link to="/app/holders/new">
                <UserPlus className="h-4 w-4 me-1" /> {t("holders.new")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="text-sm">
            {t("holders.totalHolders")}: {fmtTotal(dashSummary?.holderCount ?? null)} ·
            {" "}{t("holders.linkedAccounts")}: {fmtTotal(dashSummary?.holderAccountCount ?? null)}
          </Badge>
          <Link
            to="/app/accounts"
            className="text-[11px] text-gold underline-offset-2 hover:underline"
          >
            {t("holders.viewAllLinked")}
          </Link>
        </div>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("holders.searchPlaceholder")} className="ps-9" />
        </div>
        {!dq.trim() && (
          <p className="text-xs text-muted-foreground">
            {t("holders.useSearchHint")}
          </p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("holders.empty")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((h: any) => (
              <Link key={h.id} to="/app/holders/$id" params={{ id: String(h.id) }}>
                <Card className="card-luxe transition hover:border-[oklch(0.82_0.14_85/0.5)]">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-gold">{h.dahab_account_number}</div>
                        <div className="mt-1 truncate font-serif text-lg" dir="auto">{h.canonical_name}</div>
                        {(h.phone || h.email) ? (
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {[h.phone, h.email].filter(Boolean).join(" · ")}
                          </div>
                        ) : null}
                        {h.created_at && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {t("holders.created")} {new Date(h.created_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary">{h.status}</Badge>
                    </div>
                    <div
                      className="mt-2 text-[11px] text-muted-foreground"
                      title={
                        typeof h.linked_account_count === "number"
                          ? undefined
                          : "Backend did not return linked_account_count"
                      }
                    >
                      {t("holders.linkedCount")}{" "}
                      {typeof h.linked_account_count === "number"
                        ? h.linked_account_count
                        : "—"}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(h.holder_accounts ?? []).map((a: any) => (
                        <Badge key={a.id} variant="outline" className="text-xs">{a.currency_code} · {a.account_number}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}