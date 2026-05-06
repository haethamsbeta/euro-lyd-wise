import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { useDebounced } from "@/hooks/use-debounced";
import { NewHolderDialog } from "@/components/app/new-holder-dialog";
import { useAuth, hasAnyRole } from "@/lib/auth";

export const Route = createFileRoute("/app/holders/")({ component: HoldersList });

function HoldersList() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [curFilter, setCurFilter] = useState<string | null>(null);
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);

  const { data: summary } = useQuery({
    queryKey: ["holders.summary"],
    queryFn: async () => {
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
    queryKey: ["holders.list", dq],
    queryFn: async () => {
      const term = dq.trim();
      if (term) {
        // Search across holders + linked accounts
        const [byHolder, byAccount] = await Promise.all([
          supabase
            .from("account_holders")
            .select("id,dahab_account_number,canonical_name,normalized_name,status,phone,email,created_at,holder_accounts(id,currency_code,account_number,account_display_name)")
            .or(`canonical_name.ilike.%${term}%,normalized_name.ilike.%${term}%,dahab_account_number.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
            .limit(100),
          supabase
            .from("holder_accounts")
            .select("account_holder_id, account_holders!inner(id,dahab_account_number,canonical_name,normalized_name,status,phone,email,created_at,holder_accounts(id,currency_code,account_number,account_display_name))")
            .or(`account_number.ilike.%${term}%,account_display_name.ilike.%${term}%`)
            .limit(100),
        ]);
        if (byHolder.error) throw byHolder.error;
        if (byAccount.error) throw byAccount.error;
        const map = new Map<number, any>();
        for (const h of byHolder.data ?? []) map.set(h.id, h);
        for (const a of byAccount.data ?? []) {
          const h: any = (a as any).account_holders;
          if (h) map.set(h.id, h);
        }
        return Array.from(map.values());
      }
      let qb = supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,normalized_name,status,phone,email,created_at,holder_accounts(id,currency_code,account_number,account_display_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (data ?? []).filter((h: any) =>
    !curFilter || (h.holder_accounts ?? []).some((a: any) => a.currency_code === curFilter),
  );

  return (
    <div>
      <PageHeader
        title="DAHAB Holders"
        description="Customer profiles and their linked currency accounts."
        actions={isAdmin ? <NewHolderDialog /> : undefined}
      />
      <div className="space-y-4 p-4 sm:p-6">
        {summary && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary" className="text-sm">
              {summary.holders} holders · {summary.accts} linked accounts
            </Badge>
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
                  {c} · {n}
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