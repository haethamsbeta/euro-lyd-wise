import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/app/holders/$id")({ component: HolderDetail });

function HolderDetail() {
  const { id } = Route.useParams();
  const holderId = Number(id);
  const [openAcc, setOpenAcc] = useState<number | null>(null);

  const { data: holder, isLoading } = useQuery({
    queryKey: ["holder", holderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,status,holder_type,holder_accounts(id,account_number,dahab_account_number,currency_code,account_nature,account_display_name,account_alias_name,current_balance,status)")
        .eq("id", holderId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title={holder?.canonical_name ?? "Holder"}
        description={holder?.dahab_account_number}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/holders"><ArrowLeft className="h-4 w-4 me-1" /> Back</Link>
          </Button>
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !holder ? (
          <p className="text-sm text-muted-foreground">Holder not found.</p>
        ) : (
          <>
            <Card className="card-luxe">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="font-mono text-sm text-gold">{holder.dahab_account_number}</div>
                <div className="font-serif text-xl" dir="auto">{holder.canonical_name}</div>
                <Badge variant="secondary">{holder.status}</Badge>
                <Badge variant="outline">{holder.holder_type}</Badge>
                <span className="ms-auto text-xs text-muted-foreground">{(holder.holder_accounts ?? []).length} linked account(s)</span>
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-2">
              {(holder.holder_accounts ?? []).map((a: any) => {
                const isOpen = openAcc === a.id;
                return (
                  <Card key={a.id} className={`card-luxe transition ${isOpen ? "md:col-span-2 border-[oklch(0.82_0.14_85/0.5)]" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setOpenAcc(isOpen ? null : a.id)}
                      className="flex w-full items-start justify-between gap-2 p-4 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge>{a.currency_code}</Badge>
                          <span className="font-mono text-sm">{a.account_number}</span>
                          <Badge variant="outline" className="text-xs">{a.account_nature}</Badge>
                          {a.dahab_account_number && (
                            <Badge variant="outline" className="text-xs font-mono text-gold">{a.dahab_account_number}</Badge>
                          )}
                        </div>
                        <div className="mt-2 truncate text-base" dir="rtl">{a.account_display_name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{a.account_alias_name}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="font-serif text-lg text-gold">
                          {Number(a.current_balance ?? 0).toLocaleString()} {a.currency_code}
                        </div>
                        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {isOpen && <LedgerPanel accountId={a.id} currency={a.currency_code} />}
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LedgerPanel({ accountId, currency }: { accountId: number; currency: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["holder-ledger", accountId, from, to],
    queryFn: async () => {
      let q = supabase
        .from("holder_ledger_entries")
        .select("id,tx_number,posted_at,description,debit_amount,credit_amount,balance_after,currency_code")
        .eq("account_id", accountId)
        .order("posted_at", { ascending: true })
        .limit(500);
      if (from) q = q.gte("posted_at", from);
      if (to) q = q.lte("posted_at", to + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const exportCsv = () => {
    const rows = [["Date", "TX", "Description", "Debit", "Credit", "Balance"], ...(data ?? []).map(e => [
      new Date(e.posted_at).toISOString(), e.tx_number, e.description ?? "", e.debit_amount, e.credit_amount, e.balance_after,
    ])];
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ledger-${accountId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-t border-[oklch(0.82_0.14_85/0.15)] p-4">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">From
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ms-2 rounded border bg-background px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-muted-foreground">To
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ms-2 rounded border bg-background px-2 py-1 text-sm" />
        </label>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.length}>Export CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="p-2">Date</th>
              <th className="p-2">TX #</th>
              <th className="p-2">Description</th>
              <th className="p-2 text-right">Debit</th>
              <th className="p-2 text-right">Credit</th>
              <th className="p-2 text-right">Balance ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
            ) : (data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No entries for this account yet.</td></tr>
            ) : data!.map((e) => (
              <tr key={e.id} className="border-t border-[oklch(0.82_0.14_85/0.08)]">
                <td className="p-2 text-xs">{new Date(e.posted_at).toLocaleString()}</td>
                <td className="p-2 font-mono text-xs">{e.tx_number}</td>
                <td className="p-2">{e.description}</td>
                <td className="p-2 text-right">{Number(e.debit_amount).toLocaleString()}</td>
                <td className="p-2 text-right">{Number(e.credit_amount).toLocaleString()}</td>
                <td className="p-2 text-right font-medium">{Number(e.balance_after).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
