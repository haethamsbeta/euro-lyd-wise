import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, Database, AlertTriangle } from "lucide-react";
import { SandboxNav } from "@/components/app/sandbox-nav";
import {
  useSandbox,
  sandboxApi,
  accountBalance,
  type SandboxAccountType,
  type NormalSide,
} from "@/lib/sandbox/store";

export const Route = createFileRoute("/app/admin/sandbox-workspace")({
  component: SandboxWorkspacePage,
  head: () => ({ meta: [{ title: "Sandbox Workspace — DAHAB" }] }),
});

const TYPES: SandboxAccountType[] = [
  "asset", "liability", "equity", "revenue", "expense", "contra", "clearing", "test",
];
const CURRENCIES = ["LYD", "USD", "EUR", "GBP"];

function SandboxWorkspacePage() {
  const sb = useSandbox();
  const cid = sb.selectedConsumerId;
  const consumer = sb.consumers.find((c) => c.id === cid);
  const accounts = sb.accounts.filter((a) => a.consumerId === cid);

  const [name, setName] = useState("");
  const [type, setType] = useState<SandboxAccountType>("asset");
  const [normal, setNormal] = useState<NormalSide>("debit");
  const [currency, setCurrency] = useState("LYD");
  const [opening, setOpening] = useState("0");

  if (!cid || !consumer) {
    return (
      <div className="pb-16">
        <SandboxNav />
        <div className="max-w-6xl mx-auto rounded-xl border border-dashed border-border bg-surface-2/40 p-10 text-center">
          <Database className="mx-auto h-8 w-8 text-text-secondary mb-3" />
          <p className="text-sm text-text-secondary">
            Select or create a sandbox consumer above to manage sandbox accounts.
          </p>
        </div>
      </div>
    );
  }

  function addCustom() {
    if (!name.trim()) return toast.error("Account name required");
    sandboxApi.addAccount({
      consumerId: cid!,
      name: name.trim(),
      type,
      normal,
      currency,
      openingBalance: parseFloat(opening) || 0,
    });
    setName(""); setOpening("0");
    toast.success("Sandbox account added");
  }

  return (
    <div className="pb-16">
      <SandboxNav />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-text-primary">
              {consumer.name}
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Sandbox workspace · {accounts.length} accounts
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const created = sandboxApi.generateAccountSet(cid!, "LYD");
                toast.success(`Generated ${created.length} sandbox accounts`);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-[#14181F] text-sm font-semibold hover:opacity-90"
            >
              <Sparkles className="w-4 h-4" /> Generate Sandbox Account Set
            </button>
            <button
              onClick={() => {
                const r = sandboxApi.seedBalanced(cid!);
                if (!r.ok) toast.error(r.error!); else toast.success("Seeded balanced transaction");
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-sm hover:border-gold/50"
            >
              Seed balanced
            </button>
            <button
              onClick={() => {
                const r = sandboxApi.seedUnbalanced(cid!);
                if (!r.ok) toast.error(r.error!); else toast.success("Seeded unbalanced draft");
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-sm hover:border-gold/50"
            >
              Seed unbalanced
            </button>
            <button
              onClick={() => {
                const r = sandboxApi.seedHistory(cid!, 5);
                if (!r.ok) toast.error("Seed failed");
                else toast.success("Seeded 5 posted transactions");
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-sm hover:border-gold/50"
            >
              Seed history
            </button>
            <button
              onClick={() => {
                if (!confirm("Reset ALL sandbox data (every consumer)?")) return;
                sandboxApi.resetAll();
                toast.success("All sandbox data reset");
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/40 text-red-400 text-sm hover:bg-red-500/10"
            >
              <AlertTriangle className="w-4 h-4" /> Reset all sandbox
            </button>
          </div>
        </div>

        {/* Add custom account */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-wider text-text-secondary font-medium mb-3">
            Add custom sandbox account
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Account name"
              className="md:col-span-2 bg-surface-2 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-gold"
            />
            <select value={type} onChange={(e) => setType(e.target.value as SandboxAccountType)}
              className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={normal} onChange={(e) => setNormal(e.target.value as NormalSide)}
              className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm">
              <option value="debit">Normal: Debit</option>
              <option value="credit">Normal: Credit</option>
            </select>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              <input value={opening} onChange={(e) => setOpening(e.target.value)} type="number"
                placeholder="Opening" className="flex-1 bg-surface-2 border border-border rounded-md px-3 py-2 text-sm" />
              <button onClick={addCustom}
                className="px-3 py-2 rounded-md bg-gold text-[#14181F] text-sm font-semibold inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          </div>
        </div>

        {/* Accounts table with balances */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-wider text-text-secondary font-medium">
            Sandbox accounts &amp; live balances
          </div>
          {accounts.length === 0 ? (
            <div className="p-10 text-center text-sm text-text-secondary">
              No sandbox accounts yet. Click "Generate Sandbox Account Set" or add a custom account above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-text-secondary bg-surface-2/40">
                  <tr>
                    <th className="px-4 py-2 text-left">Account</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Normal</th>
                    <th className="px-4 py-2 text-left">Currency</th>
                    <th className="px-4 py-2 text-right">Opening</th>
                    <th className="px-4 py-2 text-right">Debits</th>
                    <th className="px-4 py-2 text-right">Credits</th>
                    <th className="px-4 py-2 text-right">Balance</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const entries = sb.ledger.filter((e) => e.accountId === a.id);
                    const debit = entries.reduce((s, e) => s + e.debit, 0);
                    const credit = entries.reduce((s, e) => s + e.credit, 0);
                    const bal = accountBalance(sb, a.id);
                    return (
                      <tr key={a.id} className="border-t border-border hover:bg-surface-2/40">
                        <td className="px-4 py-2 font-medium text-text-primary">{a.name}</td>
                        <td className="px-4 py-2 text-text-secondary">{a.type}</td>
                        <td className="px-4 py-2 text-text-secondary">{a.normal}</td>
                        <td className="px-4 py-2"><span className="text-gold font-mono text-xs">{a.currency}</span></td>
                        <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{a.openingBalance.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-emerald-400">{debit.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-400">{credit.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-text-primary">{bal.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => sandboxApi.removeAccount(a.id)}
                            className="p-1.5 rounded-md text-text-secondary hover:text-red-400 hover:bg-red-500/10">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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