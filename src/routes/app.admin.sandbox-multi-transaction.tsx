import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Send, Database, X } from "lucide-react";
import { SandboxNav, StatusPill } from "@/components/app/sandbox-nav";
import {
  useSandbox, sandboxApi, validateTransaction, totals, newDraftTransaction, newDraftLine,
  type SandboxTransaction,
} from "@/lib/sandbox/store";

export const Route = createFileRoute("/app/admin/sandbox-multi-transaction")({
  component: SandboxMultiTransactionPage,
  head: () => ({ meta: [{ title: "Multi-Transaction Sandbox — DAHAB" }] }),
});

function SandboxMultiTransactionPage() {
  const sb = useSandbox();
  const cid = sb.selectedConsumerId;
  const consumer = sb.consumers.find((c) => c.id === cid);
  const accounts = sb.accounts.filter((a) => a.consumerId === cid);
  const txs = sb.transactions.filter((t) => t.consumerId === cid);

  const [drafts, setDrafts] = useState<SandboxTransaction[]>([]);

  const summary = useMemo(() => {
    let totalD = 0, totalC = 0, valid = 0;
    drafts.forEach((d) => {
      const t = totals(d.lines);
      totalD += t.debit; totalC += t.credit;
      if (validateTransaction(d).ok) valid++;
    });
    return {
      drafts: drafts.length,
      valid,
      posted: txs.filter((t) => t.status === "posted").length,
      totalDebits: totalD,
      totalCredits: totalC,
      diff: totalD - totalC,
    };
  }, [drafts, txs]);

  if (!cid || !consumer) {
    return (
      <div className="pb-16">
        <SandboxNav />
        <div className="max-w-6xl mx-auto rounded-xl border border-dashed border-border bg-surface-2/40 p-10 text-center">
          <Database className="mx-auto h-8 w-8 text-text-secondary mb-3" />
          <p className="text-sm text-text-secondary">Select a sandbox consumer to use the batch builder.</p>
        </div>
      </div>
    );
  }
  if (accounts.length < 2) {
    return (
      <div className="pb-16">
        <SandboxNav />
        <div className="max-w-6xl mx-auto rounded-xl border border-dashed border-border bg-surface-2/40 p-10 text-center">
          <p className="text-sm text-text-secondary">
            This consumer has no sandbox accounts. Open the Workspace tab and click "Generate Sandbox Account Set".
          </p>
        </div>
      </div>
    );
  }

  function addDraft() {
    setDrafts((d) => [...d, newDraftTransaction(cid!)]);
  }
  function removeDraft(id: string) {
    setDrafts((d) => d.filter((x) => x.id !== id));
  }
  function update(id: string, patch: Partial<SandboxTransaction>) {
    setDrafts((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function updateLine(txId: string, lineId: string, patch: Partial<SandboxTransaction["lines"][number]>) {
    setDrafts((d) =>
      d.map((x) =>
        x.id !== txId ? x : { ...x, lines: x.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) },
      ),
    );
  }
  function addLine(txId: string) {
    setDrafts((d) => d.map((x) => (x.id === txId ? { ...x, lines: [...x.lines, newDraftLine()] } : x)));
  }
  function dupLine(txId: string, lineId: string) {
    setDrafts((d) =>
      d.map((x) => {
        if (x.id !== txId) return x;
        const idx = x.lines.findIndex((l) => l.id === lineId);
        if (idx < 0) return x;
        const dup = { ...x.lines[idx], id: `L-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}` };
        const lines = [...x.lines]; lines.splice(idx + 1, 0, dup);
        return { ...x, lines };
      }),
    );
  }
  function removeLine(txId: string, lineId: string) {
    setDrafts((d) =>
      d.map((x) => (x.id !== txId ? x : { ...x, lines: x.lines.filter((l) => l.id !== lineId) })),
    );
  }

  function postBatch() {
    let posted = 0, failed = 0;
    drafts.forEach((d) => {
      sandboxApi.upsertTransaction(d);
      const r = sandboxApi.postTransaction(d.id);
      if (r.ok) posted++; else failed++;
    });
    toast[failed ? "warning" : "success"](`Batch posted: ${posted} ok, ${failed} failed`);
    setDrafts([]);
  }

  return (
    <div className="pb-16">
      <SandboxNav />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-text-primary">Multi-Transaction Sandbox</h1>
            <p className="text-sm text-text-secondary mt-1">{consumer.name} · build many sandbox transactions and post as a batch</p>
          </div>
          <div className="flex gap-2">
            <button onClick={addDraft}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/40 text-gold text-sm hover:bg-gold/10">
              <Plus className="w-4 h-4" /> Add transaction
            </button>
            <button
              onClick={postBatch}
              disabled={drafts.length === 0 || summary.valid !== summary.drafts}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-[#14181F] text-sm font-semibold disabled:opacity-50">
              <Send className="w-4 h-4" /> Post batch ({summary.drafts})
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            ["Drafts", summary.drafts],
            ["Valid", summary.valid],
            ["Posted (history)", summary.posted],
            ["Total Debits", summary.totalDebits.toFixed(2)],
            ["Total Credits", summary.totalCredits.toFixed(2)],
            ["Out of balance", summary.diff.toFixed(2)],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl border border-border bg-surface px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-text-secondary">{k}</div>
              <div className="text-lg font-semibold tabular-nums text-text-primary">{v}</div>
            </div>
          ))}
        </div>

        {/* Drafts */}
        {drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-2/40 p-10 text-center text-sm text-text-secondary">
            No drafts in batch. Click "Add transaction" to start.
          </div>
        ) : (
          <div className="space-y-4">
            {drafts.map((d) => {
              const v = validateTransaction(d);
              const t = totals(d.lines);
              return (
                <div key={d.id} className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
                    <input value={d.title} onChange={(e) => update(d.id, { title: e.target.value })}
                      placeholder="Transaction title"
                      className="flex-1 min-w-[180px] bg-surface-2 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-gold" />
                    <input value={d.reference} onChange={(e) => update(d.id, { reference: e.target.value })}
                      placeholder="Reference"
                      className="bg-surface-2 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-gold" />
                    <input type="date" value={d.date} onChange={(e) => update(d.id, { date: e.target.value })}
                      className="bg-surface-2 border border-border rounded-md px-3 py-1.5 text-sm" />
                    <input value={d.type} onChange={(e) => update(d.id, { type: e.target.value })}
                      placeholder="Type"
                      className="w-28 bg-surface-2 border border-border rounded-md px-3 py-1.5 text-sm" />
                    <StatusPill status={v.ok ? "validated" : "draft"} />
                    <button onClick={() => removeDraft(d.id)} className="p-1.5 rounded-md text-text-secondary hover:text-red-400 hover:bg-red-500/10">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4 space-y-2">
                    <input value={d.description} onChange={(e) => update(d.id, { description: e.target.value })}
                      placeholder="Description / memo"
                      className="w-full bg-surface-2 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-gold" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs uppercase tracking-wider text-text-secondary">
                          <tr>
                            <th className="px-2 py-1 text-left">Account</th>
                            <th className="px-2 py-1 text-right">Debit</th>
                            <th className="px-2 py-1 text-right">Credit</th>
                            <th className="px-2 py-1 text-left">Memo</th>
                            <th className="px-2 py-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.lines.map((l) => (
                            <tr key={l.id} className="border-t border-border">
                              <td className="px-2 py-1">
                                <select value={l.accountId ?? ""} onChange={(e) => updateLine(d.id, l.id, { accountId: e.target.value || null })}
                                  className="w-full bg-surface-2 border border-border rounded-md px-2 py-1 text-sm">
                                  <option value="">— account —</option>
                                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                                </select>
                              </td>
                              <td className="px-2 py-1">
                                <input type="number" value={l.debit || ""} onChange={(e) => updateLine(d.id, l.id, { debit: parseFloat(e.target.value) || 0, credit: 0 })}
                                  className="w-28 bg-surface-2 border border-border rounded-md px-2 py-1 text-right tabular-nums" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="number" value={l.credit || ""} onChange={(e) => updateLine(d.id, l.id, { credit: parseFloat(e.target.value) || 0, debit: 0 })}
                                  className="w-28 bg-surface-2 border border-border rounded-md px-2 py-1 text-right tabular-nums" />
                              </td>
                              <td className="px-2 py-1">
                                <input value={l.memo ?? ""} onChange={(e) => updateLine(d.id, l.id, { memo: e.target.value })}
                                  className="w-full bg-surface-2 border border-border rounded-md px-2 py-1 text-sm" />
                              </td>
                              <td className="px-2 py-1 text-right whitespace-nowrap">
                                <button onClick={() => dupLine(d.id, l.id)} className="p-1 text-text-secondary hover:text-gold"><Copy className="w-3.5 h-3.5" /></button>
                                <button onClick={() => removeLine(d.id, l.id)} className="p-1 text-text-secondary hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <button onClick={() => addLine(d.id)} className="text-gold hover:underline inline-flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add line
                      </button>
                      <div className="flex items-center gap-3">
                        <span className="text-text-secondary">Debits <span className="text-emerald-400 tabular-nums font-semibold">{t.debit.toFixed(2)}</span></span>
                        <span className="text-text-secondary">Credits <span className="text-red-400 tabular-nums font-semibold">{t.credit.toFixed(2)}</span></span>
                        <span className={t.balanced ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                          {t.balanced ? "Balanced" : `Off by ${Math.abs(t.diff).toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                    {!v.ok && <div className="text-xs text-amber-400">⚠ {v.error}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Existing transactions list with reverse/void controls */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-wider text-text-secondary font-medium">
            Sandbox transactions for this consumer
          </div>
          {txs.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-secondary">No transactions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-text-secondary bg-surface-2/40">
                  <tr>
                    <th className="px-3 py-2 text-left">Reference</th>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Lines</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.slice().reverse().map((t) => {
                    const tt = totals(t.lines);
                    return (
                      <tr key={t.id} className="border-t border-border hover:bg-surface-2/40">
                        <td className="px-3 py-2 font-mono text-xs text-gold">{t.reference || t.id}</td>
                        <td className="px-3 py-2 text-text-primary">{t.title || "—"}</td>
                        <td className="px-3 py-2 text-text-secondary">{t.date}</td>
                        <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.lines.length}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{tt.debit.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          {t.status === "draft" && (
                            <button onClick={() => { sandboxApi.voidDraft(t.id); toast.success("Draft voided"); }}
                              className="text-xs px-2 py-1 rounded-md border border-border text-text-secondary hover:text-red-400 hover:border-red-400/50 mr-1">
                              Void
                            </button>
                          )}
                          {t.status === "posted" && (
                            <button onClick={() => {
                              const r = sandboxApi.reverseTransaction(t.id);
                              if (!r.ok) toast.error(r.error!); else toast.success("Reversed", { description: r.reversalId });
                            }}
                              className="text-xs px-2 py-1 rounded-md border border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}