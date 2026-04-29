import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { formatMinor, formatDateTime, parseAmountToMinor } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/app/accounts/$id")({ component: AccountDetail });

function AccountDetail() {
  const { id } = Route.useParams();
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const qc = useQueryClient();

  const { data: acc } = useQuery({
    queryKey: ["account.detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, account_number, phone, national_id, nature, status")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: bals } = useQuery({
    queryKey: ["account.balances.full", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*").eq("account_id", id);
      if (error) throw error;
      return data;
    },
  });
  const { data: tx } = useQuery({
    queryKey: ["account.tx", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at")
        .eq("customer_account_id", id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title={acc ? acc.name : "Account"}
        description={acc ? `#${acc.account_number} · ${acc.phone ?? "no phone"} · ${acc.national_id ?? "no ID"}` : ""}
        actions={
          <Button asChild variant="outline" size="sm"><Link to="/app/accounts"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
        }
      />
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Balances &amp; debit limits</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {(["USD", "EUR", "LYD"] as const).map((c) => {
                const b = bals?.find((x) => x.currency === c);
                return (
                  <BalanceCard
                    key={c} currency={c}
                    balance={b?.balance_minor ?? 0} limit={b?.debit_limit_minor ?? 0}
                    isAdmin={isAdmin}
                    onSaveLimit={async (newLimitMinor) => {
                      const { error } = await supabase.from("account_balances")
                        .update({ debit_limit_minor: newLimitMinor })
                        .eq("account_id", id).eq("currency", c);
                      if (error) { toast.error(error.message); return; }
                      toast.success("Limit updated");
                      qc.invalidateQueries({ queryKey: ["account.balances.full", id] });
                    }}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ledger</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">TX #</th>
                    <th className="px-4 py-2 text-left">When</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Channel</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tx && tx.length === 0 ? (
                    <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No entries yet.</td></tr>
                  ) : tx?.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 font-mono">{t.tx_number}</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatDateTime(t.created_at)}</td>
                      <td className="px-4 py-2 capitalize">{t.direction}</td>
                      <td className="px-4 py-2 capitalize">{t.channel}</td>
                      <td className={`px-4 py-2 text-right font-mono ${t.direction === "deposit" ? "text-success" : "text-destructive"}`}>
                        {t.direction === "deposit" ? "+" : "−"}{formatMinor(t.amount_minor, t.currency)}
                      </td>
                      <td className="px-4 py-2"><Badge variant={t.status === "posted" ? "secondary" : t.status === "pending" ? "outline" : "destructive"}>{t.status}</Badge></td>
                      <td className="max-w-sm truncate px-4 py-2 text-muted-foreground">{t.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BalanceCard({
  currency, balance, limit, isAdmin, onSaveLimit,
}: {
  currency: "USD" | "EUR" | "LYD"; balance: number; limit: number; isAdmin: boolean;
  onSaveLimit: (minor: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState((limit / 100).toString());
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs text-muted-foreground">{currency}</div>
      <div className="mt-1 font-mono text-xl">{formatMinor(balance, currency)}</div>
      <div className="mt-3 text-xs">
        <div className="text-muted-foreground">Single-debit limit</div>
        {!editing ? (
          <div className="mt-1 flex items-center justify-between">
            <div className="font-mono">{limit > 0 ? formatMinor(limit, currency) : "no limit"}</div>
            {isAdmin ? <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button> : null}
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-1">
            <Input value={val} onChange={(e) => setVal(e.target.value)} className="h-8" />
            <Button size="sm" onClick={async () => {
              const minor = val === "" || val === "0" ? 0 : parseAmountToMinor(val);
              if (minor === null) return toast.error("Invalid amount");
              await onSaveLimit(minor); setEditing(false);
            }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>×</Button>
          </div>
        )}
      </div>
    </div>
  );
}