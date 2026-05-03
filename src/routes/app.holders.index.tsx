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

export const Route = createFileRoute("/app/holders/")({ component: HoldersList });

function HoldersList() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const { data, isLoading } = useQuery({
    queryKey: ["holders.list", dq],
    queryFn: async () => {
      const term = dq.trim();
      if (term) {
        // Search across holders + linked accounts
        const [byHolder, byAccount] = await Promise.all([
          supabase
            .from("account_holders")
            .select("id,dahab_account_number,canonical_name,normalized_name,status,holder_accounts(id,currency_code,account_number,account_display_name)")
            .or(`canonical_name.ilike.%${term}%,normalized_name.ilike.%${term}%,dahab_account_number.ilike.%${term}%`)
            .limit(100),
          supabase
            .from("holder_accounts")
            .select("account_holder_id, account_holders!inner(id,dahab_account_number,canonical_name,normalized_name,status,holder_accounts(id,currency_code,account_number,account_display_name))")
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
      const { data, error } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,normalized_name,status,holder_accounts(id,currency_code,account_number,account_display_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader title="DAHAB Holders" description="Customer profiles and their linked currency accounts." />
      <div className="space-y-4 p-4 sm:p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, DAHAB #, account #" className="ps-9" />
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No holders yet. Use Account Import to load accounts from Excel.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data!.map((h: any) => (
              <Link key={h.id} to="/app/holders/$id" params={{ id: String(h.id) }}>
                <Card className="card-luxe transition hover:border-[oklch(0.82_0.14_85/0.5)]">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-gold">{h.dahab_account_number}</div>
                        <div className="mt-1 truncate font-serif text-lg" dir="auto">{h.canonical_name}</div>
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