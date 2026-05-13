import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Beaker } from "lucide-react";
import { SandboxNav, StatusPill } from "@/components/app/sandbox-nav";
import { useSandbox } from "@/lib/sandbox/store";

export const Route = createFileRoute("/app/admin/sandbox-ledger")({
  component: SandboxLedgerEntriesPage,
  head: () => ({ meta: [{ title: "Sandbox Ledger Entries — DAHAB" }] }),
});

function SandboxLedgerEntriesPage() {
  const sb = useSandbox();
  const [consumerFilter, setConsumerFilter] = useState<string>(sb.selectedConsumerId ?? "");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const accountsForFilter = useMemo(
    () => sb.accounts.filter((a) => !consumerFilter || a.consumerId === consumerFilter),
    [sb.accounts, consumerFilter],
  );

  const rows = useMemo(() => {
    const sorted = sb.ledger.slice().sort((a, b) => a.postedAt.localeCompare(b.postedAt));
    const running = new Map<string, number>();
    const enriched = sorted.map((e) => {
      const acct = sb.accounts.find((a) => a.id === e.accountId);
      const opening = acct?.openingBalance ?? 0;
      const prev = running.get(e.accountId) ?? opening;
      const next = acct?.normal === "credit" ? prev + e.credit - e.debit : prev + e.debit - e.credit;
      running.set(e.accountId, next);
      return { ...e, runningBalance: next, accountName: acct?.name ?? "?", currency: acct?.currency ?? "" };
    });
    return enriched.filter((e) => {
      if (consumerFilter && e.consumerId !== consumerFilter) return false;
      if (accountFilter && e.accountId !== accountFilter) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (from && e.postedAt.slice(0, 10) < from) return false;
      if (to && e.postedAt.slice(0, 10) > to) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!e.txReference.toLowerCase().includes(s) && !(e.memo || "").toLowerCase().includes(s)) return false;
      }
      return true;
    }).reverse();
  }, [sb.ledger, sb.accounts, consumerFilter, accountFilter, statusFilter, from, to, search]);

  return (
    <div className="pb-16">
      <SandboxNav />
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <Beaker className="h-4 w-4 text-gold" />
          <div className="text-sm">
            <span className="font-semibold text-text-primary">Sandbox-only ledger entries.</span>{" "}
            <span className="text-text-secondary">These do not affect production.</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <select value={consumerFilter} onChange={(e) => { setConsumerFilter(e.target.value); setAccountFilter(""); }}
            className="bg-surface-2 border border-border rounded-md px-2 py-2 text-sm">
            <option value="">All consumers</option>
            {sb.consumers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 py-2 text-sm">
            <option value="">All accounts</option>
            {accountsForFilter.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="posted">Posted</option>
            <option value="reversed">Reversed</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 py-2 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="bg-surface-2 border border-border rounded-md px-2 py-2 text-sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ref / memo"
            className="bg-surface-2 border border-border rounded-md px-2 py-2 text-sm" />
        </div>

        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-text-secondary">
              No sandbox ledger entries match these filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-text-secondary bg-surface-2/40">
                  <tr>
                    <th className="px-3 py-2 text-left">Posted</th>
                    <th className="px-3 py-2 text-left">Reference</th>
                    <th className="px-3 py-2 text-left">Consumer</th>
                    <th className="px-3 py-2 text-left">Account</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Running balance</th>
                    <th className="px-3 py-2 text-left">Memo</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const c = sb.consumers.find((x) => x.id === r.consumerId);
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-surface-2/40">
                        <td className="px-3 py-2 text-text-secondary tabular-nums">{r.postedAt.slice(0, 16).replace("T", " ")}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gold">{r.txReference}</td>
                        <td className="px-3 py-2 text-text-secondary">{c?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-text-primary">{r.accountName} <span className="text-text-secondary text-xs">({r.currency})</span></td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{r.debit ? r.debit.toFixed(2) : ""}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-400">{r.credit ? r.credit.toFixed(2) : ""}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.runningBalance.toFixed(2)}</td>
                        <td className="px-3 py-2 text-text-secondary">{r.memo || ""}</td>
                        <td className="px-3 py-2"><StatusPill status={r.status} /></td>
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