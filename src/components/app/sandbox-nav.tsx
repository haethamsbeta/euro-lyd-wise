import { Link, useLocation } from "@tanstack/react-router";
import { Beaker, Users, Plus, X, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSandbox, sandboxApi } from "@/lib/sandbox/store";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/app/admin/sandbox-workspace", label: "Workspace" },
  { to: "/app/admin/sandbox-multi-entry", label: "Multi-Entry" },
  { to: "/app/admin/sandbox-multi-transaction", label: "Multi-Transaction" },
  { to: "/app/admin/sandbox-ledger", label: "Ledger Entries" },
] as const;

export function SandboxNav() {
  const sb = useSandbox();
  const loc = useLocation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const selected = sb.consumers.find((c) => c.id === sb.selectedConsumerId) || null;

  return (
    <div className="max-w-6xl mx-auto space-y-3 mb-5">
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <Beaker className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="text-sm">
          <span className="font-semibold text-amber-300">SANDBOX MODE</span>{" "}
          <span className="text-amber-200/80">— No production data is read or written. All actions affect sandbox state only.</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <Users className="h-4 w-4 text-gold" />
        <div className="text-xs uppercase tracking-wider text-text-secondary font-medium">
          Sandbox Consumer
        </div>
        <select
          value={sb.selectedConsumerId ?? ""}
          onChange={(e) => sandboxApi.selectConsumer(e.target.value || null)}
          className="bg-surface-2 border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold"
        >
          <option value="">— Select consumer —</option>
          {sb.consumers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.reference ? ` (${c.reference})` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-gold/30 text-gold hover:bg-gold/10 transition"
        >
          {adding ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {adding ? "Cancel" : "New"}
        </button>
        {selected && (
          <button
            type="button"
            onClick={() => {
              sandboxApi.resetConsumer(selected.id);
              toast.success("Sandbox workspace reset", { description: selected.name });
            }}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-text-secondary hover:text-amber-400 hover:border-amber-400/40 transition"
          >
            <RotateCcw className="w-3 h-3" /> Reset workspace
          </button>
        )}
        {selected && (
          <span className="ml-auto text-xs text-text-secondary">
            <span className="font-mono text-gold">{selected.id}</span>
          </span>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Consumer name"
            className="flex-1 min-w-[180px] bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-gold"
          />
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Reference (optional)"
            className="flex-1 min-w-[140px] bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-gold"
          />
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) return toast.error("Name required");
              const c = sandboxApi.addConsumer(name.trim(), ref.trim() || undefined);
              setName("");
              setRef("");
              setAdding(false);
              toast.success("Sandbox consumer created", { description: c.name });
            }}
            className="text-xs px-3 py-1.5 rounded-md bg-gold text-[#14181F] font-semibold hover:opacity-90"
          >
            Create
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const active = loc.pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                active
                  ? "text-gold border-gold"
                  : "text-text-secondary border-transparent hover:text-text-primary",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    validated: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    posted: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    reversed: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    voided: "bg-red-500/15 text-red-300 border-red-500/30",
    sandbox: "bg-gold/15 text-gold border-gold/30",
  };
  const cls = map[status.toLowerCase()] || map.draft;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border", cls)}>
      {status}
    </span>
  );
}