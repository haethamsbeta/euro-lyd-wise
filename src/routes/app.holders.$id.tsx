import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { AddLinkedAccountDialog } from "@/components/app/add-linked-account-dialog";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/app/holders/$id")({ component: HolderDetail });

function HolderDetail() {
  const { id } = Route.useParams();
  const holderId = Number(id);
  const [openAcc, setOpenAcc] = useState<number | null>(null);
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);

  const { data: holder, isLoading } = useQuery({
    queryKey: ["holder", holderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,status,holder_type,phone,email,created_at,holder_accounts(id,account_number,dahab_account_number,currency_code,account_nature,account_display_name,account_alias_name,current_balance,status,credit_limit,debit_limit,withdraw_limit_enabled,withdraw_limit_amount)")
        .eq("id", holderId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: totals } = useQuery({
    queryKey: ["holder-totals", holderId],
    enabled: !!holderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_holder_currency_totals", { p_holder_id: holderId });
      if (error) throw error;
      return (data ?? []) as Array<{ currency: string; total_balance: number; account_count: number; total_debits: number; total_credits: number }>;
    },
  });

  return (
    <div>
      <PageHeader
        title={holder?.canonical_name ?? "Holder"}
        description={holder?.dahab_account_number}
        actions={
          <>
            {isAdmin && holder ? <AddLinkedAccountDialog holderId={holder.id} /> : null}
            <Button asChild variant="outline" size="sm">
              <Link to="/app/holders"><ArrowLeft className="h-4 w-4 me-1" /> Back</Link>
            </Button>
          </>
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
                {holder.phone ? <span className="text-xs text-muted-foreground">· {holder.phone}</span> : null}
                {holder.email ? <span className="text-xs text-muted-foreground">· {holder.email}</span> : null}
                <span className="ms-auto flex flex-col items-end text-xs text-muted-foreground">
                  <span>{(holder.holder_accounts ?? []).length} linked account(s)</span>
                  {holder.created_at && (
                    <span className="text-[10px]">Created {new Date(holder.created_at).toLocaleString()}</span>
                  )}
                </span>
              </CardContent>
              {totals && totals.length > 0 ? (
                <div className="grid gap-3 border-t border-[oklch(0.82_0.14_85/0.15)] p-4 sm:grid-cols-2 md:grid-cols-3">
                  {totals.map((t) => (
                    <div key={t.currency} className="rounded-md border border-[oklch(0.82_0.14_85/0.18)] bg-card/40 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total {t.currency}</div>
                      <div className="font-mono text-lg font-semibold">{Number(t.total_balance ?? 0).toLocaleString()} {t.currency}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {t.account_count} acct · D {Number(t.total_debits ?? 0).toLocaleString()} · C {Number(t.total_credits ?? 0).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
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
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span>Credit limit: <span className="font-mono">{Number(a.credit_limit ?? 0).toLocaleString()}</span></span>
                          <span>Debit limit: <span className="font-mono">{Number(a.debit_limit ?? 0).toLocaleString()}</span></span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="font-serif text-lg text-gold">
                          {Number(a.current_balance ?? 0).toLocaleString()} {a.currency_code}
                        </div>
                        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {isOpen && (
                      <>
                        {isAdmin && <LimitsEditor account={a} />}
                        {isAdmin && <WithdrawLimitEditor account={a} />}
                        <LedgerPanel accountId={a.id} currency={a.currency_code} />
                      </>
                    )}
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

function LimitsEditor({ account }: { account: any }) {
  const qc = useQueryClient();
  const [credit, setCredit] = useState(String(account.credit_limit ?? 0));
  const [debit, setDebit] = useState(String(account.debit_limit ?? 0));
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("holder_accounts")
        .update({ credit_limit: Number(credit) || 0, debit_limit: Number(debit) || 0 })
        .eq("id", account.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limits updated");
      qc.invalidateQueries({ queryKey: ["holder"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-[oklch(0.82_0.14_85/0.15)] p-4">
      <div>
        <label className="block text-xs text-muted-foreground">Credit limit ({account.currency_code})</label>
        <Input type="number" min="0" step="0.01" value={credit} onChange={(e) => setCredit(e.target.value)} className="w-40" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground">Debit limit ({account.currency_code})</label>
        <Input type="number" min="0" step="0.01" value={debit} onChange={(e) => setDebit(e.target.value)} className="w-40" />
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        <Pencil className="h-3.5 w-3.5 me-1" /> Save limits
      </Button>
      <p className="basis-full text-[11px] text-muted-foreground">Use 0 to leave a limit unset.</p>
    </div>
  );
}

function WithdrawLimitEditor({ account }: { account: any }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState<boolean>(!!account.withdraw_limit_enabled);
  const [amount, setAmount] = useState<string>(String(account.withdraw_limit_amount ?? 0));
  const [note, setNote] = useState("");
  const available =
    Number(account.current_balance ?? 0) +
    (enabled ? Number(amount) || 0 : 0);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("sp_set_holder_withdraw_limit", {
        p_holder_account_id: account.id,
        p_enabled: enabled,
        p_amount: Number(amount) || 0,
        p_note: note || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Withdrawal limit updated");
      qc.invalidateQueries({ queryKey: ["holder"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <div className="space-y-3 border-t border-[oklch(0.82_0.14_85/0.15)] p-4">
      <div className="text-sm font-medium">Withdrawal limit ({account.currency_code})</div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
        <div>
          <label className="block text-xs text-muted-foreground">Amount ({account.currency_code})</label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40" disabled={!enabled} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-muted-foreground">Note (optional)</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
      </div>
      <div className="rounded-md border bg-muted/30 p-2 text-xs">
        Available to withdraw:{" "}
        <span className="font-mono font-medium">
          {available.toLocaleString()} {account.currency_code}
        </span>
        <span className="ms-2 text-muted-foreground">
          (balance {Number(account.current_balance ?? 0).toLocaleString()} +{" "}
          {enabled ? `limit ${Number(amount) || 0}` : "no limit"})
        </span>
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
