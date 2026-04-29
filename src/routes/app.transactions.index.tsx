import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMinor, formatDateTime } from "@/lib/format";
import { Search } from "lucide-react";

export const Route = createFileRoute("/app/transactions/")({ component: TxList });

function TxList() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["transactions.list", q],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, customer_account_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (q.trim()) query = query.ilike("tx_number", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div>
      <PageHeader title="Transactions" description="All posted, pending, and rejected entries." />
      <div className="space-y-4 p-6">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by TX number…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">TX #</th>
                    <th className="px-4 py-2 text-left">When</th>
                    <th className="px-4 py-2 text-left">Direction</th>
                    <th className="px-4 py-2 text-left">Channel</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoading ? (
                    <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
                  ) : data && data.length === 0 ? (
                    <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No transactions.</td></tr>
                  ) : (
                    data!.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-2 font-mono">{tx.tx_number}</td>
                        <td className="px-4 py-2 text-muted-foreground">{formatDateTime(tx.created_at)}</td>
                        <td className="px-4 py-2 capitalize">{tx.direction}</td>
                        <td className="px-4 py-2 capitalize">{tx.channel}</td>
                        <td className="px-4 py-2 text-right font-mono">{formatMinor(tx.amount_minor, tx.currency)}</td>
                        <td className="px-4 py-2">
                          <Badge variant={tx.status === "posted" ? "secondary" : tx.status === "pending" ? "outline" : "destructive"}>
                            {tx.status}
                          </Badge>
                        </td>
                        <td className="max-w-md truncate px-4 py-2 text-muted-foreground">{tx.comment}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}