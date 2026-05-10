import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { useDebounced } from "@/hooks/use-debounced";
import { Button } from "@/components/ui/button";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { useDashboardSummary, fmtTotal } from "@/lib/useDashboardSummary";

export const Route = createFileRoute("/app/holders/")({ component: HoldersList });

function HoldersList() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [curFilter, setCurFilter] = useState<string | null>(null);
  const PAGE_SIZE = 50;
  const [offset, setOffset] = useState(0);
  const roles = useEffectiveRoles();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const { data: dashSummary } = useDashboardSummary();

  useEffect(() => { setOffset(0); }, [dq, curFilter]);

  const { data: summary } = useQuery({
    queryKey: ["holders.summary"],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        // Derive from /api/holders. No Supabase calls in lambda mode.
        const list = await api.holders.list({ limit: 1000 }).catch(() => [] as any[]);
        const rows = Array.isArray(list) ? list : [];
        const counts: Record<string, number> = {};
        let acctTotal = 0;
        for (const h of rows) {
          const accs = (h as any).holder_accounts ?? (h as any).accounts ?? [];
          for (const a of accs) {
            const c = a.currency_code ?? a.currency;
            if (c) counts[c] = (counts[c] ?? 0) + 1;
            acctTotal += 1;
          }
        }
        return { holders: rows.length, accts: acctTotal, counts };
      }
      const [{ count: holders }, { count: accts }, byCur] = await Promise.all([
        supabase.from("account_holders").select("id", { count: "exact", head: true }),
        supabase.from("holder_accounts").select("id", { count: "exact", head: true }),
        supabase.from("holder_accounts").select("currency_code"),
      ]);
      const counts: Record<string, number> = {};
      for (const r of byCur.data ?? []) counts[r.currency_code] = (counts[r.currency_code] ?? 0) + 1;
      return { holders: holders ?? 0, accts: accts ?? 0, counts };
    },
  });
  const { data, isLoading } = useQuery({
    queryKey: ["holders.list", dq, offset, PAGE_SIZE],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const paged = await api.holders.listPaged({
          q: dq.trim() || undefined,
          limit: PAGE_SIZE,
          offset,
        });
        const rows = paged.items ?? [];
        return {
          total: paged.total ?? rows.length,
          next_offset: paged.next_offset ?? null,
          items: rows.map((h: any) => ({
          id: h.id,
          dahab_account_number: h.dahab_account_number,
          canonical_name: h.holder_name ?? h.canonical_name,
          normalized_name: h.normalized_name ?? null,
          status: h.status ?? "active",
          phone: h.phone ?? null,
          email: h.email ?? null,
          created_at: h.created_at ?? null,
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
            .range(offset, offset + PAGE_SIZE - 1),
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
        return { items, total: items.length, next_offset: null as number | null };
      }
      const { data, error, count } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,normalized_name,status,phone,email,created_at,holder_accounts(id,currency_code,account_number,account_display_name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      return { items: data ?? [], total: count ?? (data?.length ?? 0), next_offset: null as number | null };
    },
  });

  const items = (data?.items ?? []) as any[];
  const total = data?.total ?? 0;
  const filtered = items.filter((h: any) =>
    !curFilter || (h.holder_accounts ?? []).some((a: any) => a.currency_code === curFilter),
  );
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + items.length, total);
  const canPrev = offset > 0;
  const canNext = data?.next_offset != null
    ? true
    : items.length === PAGE_SIZE && end < total;

  return (
    <div>
      <PageHeader
        title="DAHAB Holders"
        description="Customer profiles and their linked currency accounts."
        actions={
          isAdmin ? (
            <Button asChild className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
              <Link to="/app/holders/new">
                <UserPlus className="h-4 w-4 me-1" /> New holder
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        {summary && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary" className="text-sm">
              Total holders: {fmtTotal(dashSummary?.holderCount ?? null)} ·
              Linked accounts: {fmtTotal(dashSummary?.holderAccountCount ?? null)} ·
              Showing first {summary.holders}
            </Badge>
            <Link
              to="/app/accounts"
              className="text-[11px] text-gold underline-offset-2 hover:underline"
            >
              View all linked accounts →
            </Link>
            <button
              type="button"
              onClick={() => setCurFilter(null)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${!curFilter ? "border-gold text-gold" : "text-muted-foreground"}`}
            >
              All
            </button>
            {Object.entries(summary.counts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([c, n]) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurFilter(curFilter === c ? null : c)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${curFilter === c ? "border-gold text-gold" : "text-muted-foreground"}`}
                >
                  {c} · {n} <span className="opacity-60">(loaded)</span>
                </button>
              ))}
          </div>
        )}
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by DAHAB #, name, account #, phone, or email" className="ps-9" />
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No holders yet. Use Account Import to load accounts from Excel.</p>
        ) : (
          <>
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
                            Created {new Date(h.created_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary">{h.status}</Badge>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {(h.holder_accounts ?? []).length} linked account
                      {(h.holder_accounts ?? []).length === 1 ? "" : "s"}
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
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              Showing {start}–{end} of {total} holders
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canPrev}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canNext}
                onClick={() => setOffset(data?.next_offset ?? offset + PAGE_SIZE)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}