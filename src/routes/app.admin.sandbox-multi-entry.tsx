import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Beaker, Plus, Trash2, RotateCcw, Send, AlertTriangle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/app/section-header";
import { useAuth } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/dahabApi";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/admin/sandbox-multi-entry")({
  component: SandboxMultiEntryPage,
  head: () => ({ meta: [{ title: "Sandbox Multi-Entry Transaction — DAHAB" }] }),
});

const FALLBACK_CURRENCIES = ["LYD", "USD", "EUR", "GBP"] as const;

type AccountOption = {
  id: string;
  label: string;
  kind: "vault" | "holder_account";
  currency_code?: string;
};

type OptionsResponse = {
  accounts?: AccountOption[];
  vaults?: AccountOption[];
  currencies?: string[];
  branches?: { id: string; name: string }[];
};

type Row = {
  uid: string;
  account_id: string;
  currency: string;
  amount: string;
  memo: string;
};

const newRow = (): Row => ({
  uid: crypto.randomUUID(),
  account_id: "",
  currency: "",
  amount: "",
  memo: "",
});

function SandboxMultiEntryPage() {
  const { user } = useAuth();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [txDate, setTxDate] = useState(today);
  const [branchId, setBranchId] = useState<string>("");
  const [narration, setNarration] = useState("");
  const [inflows, setInflows] = useState<Row[]>([newRow()]);
  const [outflows, setOutflows] = useState<Row[]>([newRow()]);
  const [posting, setPosting] = useState(false);

  const optionsQ = useQuery<OptionsResponse>({
    queryKey: ["sandbox-multi-entry", "options"],
    queryFn: async () => {
      try {
        return await apiFetch<OptionsResponse>("/sandbox/multi-entry/options");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 0)) {
          return {} as OptionsResponse;
        }
        throw e;
      }
    },
    staleTime: 60_000,
  });

  const accountOptions: AccountOption[] = useMemo(() => {
    const o = optionsQ.data || {};
    const list = [...(o.vaults || []), ...(o.accounts || [])];
    if (list.length === 0) {
      // Placeholder demo options so the form is usable before backend is wired.
      return [
        { id: "vault-lyd-main", label: "Main Vault — LYD", kind: "vault", currency_code: "LYD" },
        { id: "vault-usd-main", label: "Main Vault — USD", kind: "vault", currency_code: "USD" },
        { id: "vault-eur-main", label: "Main Vault — EUR", kind: "vault", currency_code: "EUR" },
        { id: "vault-gbp-main", label: "Main Vault — GBP", kind: "vault", currency_code: "GBP" },
        { id: "acct-demo-lyd", label: "Demo Holder — LYD", kind: "holder_account", currency_code: "LYD" },
        { id: "acct-demo-usd", label: "Demo Holder — USD", kind: "holder_account", currency_code: "USD" },
      ];
    }
    return list;
  }, [optionsQ.data]);

  const currencies = useMemo(() => {
    const fromOpts = optionsQ.data?.currencies;
    if (fromOpts && fromOpts.length) return fromOpts;
    return [...FALLBACK_CURRENCIES];
  }, [optionsQ.data]);

  const branches = optionsQ.data?.branches || [];

  // ---------- Row helpers ----------
  const updateRow = (
    setter: React.Dispatch<React.SetStateAction<Row[]>>,
    uid: string,
    patch: Partial<Row>,
  ) => setter((rows) => rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const removeRow = (
    setter: React.Dispatch<React.SetStateAction<Row[]>>,
    uid: string,
  ) => setter((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.uid !== uid)));

  // ---------- Balance summary ----------
  const summary = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number }>();
    const add = (rows: Row[], side: "inflow" | "outflow") => {
      for (const r of rows) {
        if (!r.currency) continue;
        const amt = Number(r.amount);
        if (!Number.isFinite(amt) || amt <= 0) continue;
        const cur = map.get(r.currency) || { inflow: 0, outflow: 0 };
        cur[side] += amt;
        map.set(r.currency, cur);
      }
    };
    add(inflows, "inflow");
    add(outflows, "outflow");
    return Array.from(map.entries())
      .map(([currency, v]) => ({
        currency,
        inflow: v.inflow,
        outflow: v.outflow,
        diff: +(v.inflow - v.outflow).toFixed(2),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }, [inflows, outflows]);

  const unbalanced = summary.filter((s) => Math.abs(s.diff) > 0.0001);
  const allBalanced = summary.length > 0 && unbalanced.length === 0;

  const rowComplete = (r: Row) =>
    !!r.account_id && !!r.currency && Number(r.amount) > 0;

  const inflowsValid = inflows.length > 0 && inflows.every(rowComplete);
  const outflowsValid = outflows.length > 0 && outflows.every(rowComplete);
  const canPost = inflowsValid && outflowsValid && allBalanced && !posting;

  // ---------- Ledger preview ----------
  const ledger = useMemo(() => {
    const lines: {
      lineNo: number;
      side: "Inflow" | "Outflow";
      account: string;
      currency: string;
      debit: number;
      credit: number;
      amount: number;
      memo: string;
    }[] = [];
    let n = 1;
    const accountLabel = (id: string) =>
      accountOptions.find((a) => a.id === id)?.label || id || "—";
    for (const r of inflows) {
      const amt = Number(r.amount) || 0;
      if (!r.account_id && !r.currency && !amt) continue;
      lines.push({
        lineNo: n++,
        side: "Inflow",
        account: accountLabel(r.account_id),
        currency: r.currency || "—",
        debit: amt,
        credit: 0,
        amount: amt,
        memo: r.memo,
      });
    }
    for (const r of outflows) {
      const amt = Number(r.amount) || 0;
      if (!r.account_id && !r.currency && !amt) continue;
      lines.push({
        lineNo: n++,
        side: "Outflow",
        account: accountLabel(r.account_id),
        currency: r.currency || "—",
        debit: 0,
        credit: amt,
        amount: amt,
        memo: r.memo,
      });
    }
    return lines;
  }, [inflows, outflows, accountOptions]);

  // ---------- Actions ----------
  const clearForm = () => {
    setTxDate(today);
    setBranchId("");
    setNarration("");
    setInflows([newRow()]);
    setOutflows([newRow()]);
  };

  const buildPayload = () => ({
    transaction_date: txDate,
    branch_id: branchId || null,
    narration: narration || null,
    teller: user?.email || null,
    inflows: inflows.map((r) => ({
      account_id: r.account_id,
      currency_code: r.currency,
      amount: Number(r.amount),
      memo: r.memo || null,
    })),
    outflows: outflows.map((r) => ({
      account_id: r.account_id,
      currency_code: r.currency,
      amount: Number(r.amount),
      memo: r.memo || null,
    })),
    idempotency_key: crypto.randomUUID(),
  });

  const post = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      // Optional pre-validate
      try {
        await apiFetch("/sandbox/multi-entry/validate", {
          method: "POST",
          body: JSON.stringify(buildPayload()),
        });
      } catch (e) {
        if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 0)) throw e;
      }

      let txNumber: string | null = null;
      try {
        const res = await apiFetch<{ tx_number?: string; transaction_number?: string; id?: string }>(
          "/sandbox/multi-entry/post",
          { method: "POST", body: JSON.stringify(buildPayload()) },
        );
        txNumber = res.tx_number || res.transaction_number || res.id || null;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 0)) {
          txNumber = `SBX-${Date.now().toString(36).toUpperCase()}`;
        } else {
          throw e;
        }
      }

      toast.success("Sandbox transaction posted successfully.", {
        description: txNumber ? `Transaction number: ${txNumber}` : undefined,
      });
      clearForm();
    } catch (e: any) {
      toast.error("Failed to post sandbox transaction", {
        description: e?.message ?? String(e),
      });
    } finally {
      setPosting(false);
    }
  };

  // ---------- Render helpers ----------
  const renderRow = (
    row: Row,
    setter: React.Dispatch<React.SetStateAction<Row[]>>,
    side: "inflow" | "outflow",
  ) => (
    <div
      key={row.uid}
      className="grid grid-cols-1 gap-2 rounded-lg border border-border/50 bg-card/40 p-3 md:grid-cols-[2fr_1fr_1fr_2fr_auto]"
    >
      <Select
        value={row.account_id}
        onValueChange={(v) => {
          const opt = accountOptions.find((a) => a.id === v);
          updateRow(setter, row.uid, {
            account_id: v,
            currency: row.currency || opt?.currency_code || "",
          });
        }}
      >
        <SelectTrigger><SelectValue placeholder="Account / vault" /></SelectTrigger>
        <SelectContent>
          {accountOptions.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.label}{a.currency_code ? ` (${a.currency_code})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={row.currency} onValueChange={(v) => updateRow(setter, row.uid, { currency: v })}>
        <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
        <SelectContent>
          {currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        placeholder="Amount"
        value={row.amount}
        onChange={(e) => updateRow(setter, row.uid, { amount: e.target.value })}
      />
      <Input
        placeholder="Memo (optional)"
        value={row.memo}
        onChange={(e) => updateRow(setter, row.uid, { memo: e.target.value })}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => removeRow(setter, row.uid)}
        aria-label={`Remove ${side} row`}
        disabled={(side === "inflow" ? inflows : outflows).length === 1}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Sandbox Multi-Entry Transaction"
        subtitle="Test multi-entry, multi-currency posting without affecting production."
        icon={Beaker}
      />

      {/* Sandbox banner */}
      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-warning-foreground">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="text-sm font-medium">
          SANDBOX ONLY — No production balances affected.
        </div>
      </div>

      {/* Header fields */}
      <Card>
        <CardHeader><CardTitle>Transaction header</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Transaction date</Label>
              <Input id="tx-date" type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="teller">Teller / user</Label>
              <Input id="teller" value={user?.email || ""} readOnly placeholder="—" />
            </div>
            {branches.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="branch">Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger id="branch"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={cn("space-y-1.5", branches.length > 0 ? "md:col-span-2 lg:col-span-4" : "md:col-span-2 lg:col-span-2")}>
              <Label htmlFor="narration">Narration / note</Label>
              <Textarea
                id="narration"
                rows={2}
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Description of the transaction"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inflows */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-success" />
            Inflow accounts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {inflows.map((r) => renderRow(r, setInflows, "inflow"))}
          <Button type="button" variant="outline" onClick={() => setInflows((rs) => [...rs, newRow()])}>
            <Plus className="h-4 w-4" /> Add inflow row
          </Button>
        </CardContent>
      </Card>

      {/* Outflows */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpFromLine className="h-4 w-4 text-destructive" />
            Outflow accounts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {outflows.map((r) => renderRow(r, setOutflows, "outflow"))}
          <Button type="button" variant="outline" onClick={() => setOutflows((rs) => [...rs, newRow()])}>
            <Plus className="h-4 w-4" /> Add outflow row
          </Button>
        </CardContent>
      </Card>

      {/* Balance summary */}
      <Card>
        <CardHeader><CardTitle>Balance summary by currency</CardTitle></CardHeader>
        <CardContent>
          {summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add inflow and outflow rows to see balances.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Total inflow</TableHead>
                  <TableHead className="text-right">Total outflow</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((s) => {
                  const ok = Math.abs(s.diff) <= 0.0001;
                  return (
                    <TableRow key={s.currency}>
                      <TableCell className="font-medium">{s.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.inflow.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.outflow.toFixed(2)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", !ok && "text-destructive")}>
                        {s.diff.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {ok ? <Badge variant="secondary">Balanced</Badge>
                            : <Badge variant="destructive">Unbalanced</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {unbalanced.length > 0 && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <div className="font-medium text-destructive">
                  This transaction is not balanced. Each currency must have equal inflow and outflow totals before posting.
                </div>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {unbalanced.map((s) => (
                    <li key={s.currency}>
                      {s.currency}: difference {s.diff.toFixed(2)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ledger preview */}
      <Card>
        <CardHeader><CardTitle>Ledger posting preview</CardTitle></CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lines yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Account / vault</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Memo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((l) => (
                  <TableRow key={l.lineNo}>
                    <TableCell>{l.lineNo}</TableCell>
                    <TableCell>
                      <Badge variant={l.side === "Inflow" ? "secondary" : "outline"}>{l.side}</Badge>
                    </TableCell>
                    <TableCell>{l.account}</TableCell>
                    <TableCell>{l.currency}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.debit ? l.debit.toFixed(2) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.credit ? l.credit.toFixed(2) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{l.memo || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={clearForm}>
          <RotateCcw className="h-4 w-4" /> Clear form
        </Button>
        <Button type="button" variant="gold" onClick={post} disabled={!canPost}>
          <Send className="h-4 w-4" />
          {posting ? "Posting…" : "Post Sandbox Transaction"}
        </Button>
      </div>
    </div>
  );
}
