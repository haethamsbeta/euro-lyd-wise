import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, Search, User, Building2, Briefcase, Wallet, Landmark,
  AlertCircle, CheckCircle2, ArrowDownToLine, ArrowUpFromLine, Sparkles, Shield,
  ArrowRight, X, ArrowRightLeft, Scale, Calendar, FileText, Beaker,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/dahabApi";
import { SandboxNav } from "@/components/app/sandbox-nav";

export const Route = createFileRoute("/app/admin/sandbox-multi-entry")({
  component: SandboxMultiEntryPage,
  head: () => ({ meta: [{ title: "Sandbox Multi-Entry Transaction — DAHAB" }] }),
});

/* ─── Types ─────────────────────────────────────────────────── */
type PartyType = "account" | "vault";
type VaultType = "Cash" | "Bank";
type Side = "inflow" | "outflow";

interface JournalEntry {
  id: string;
  type: Side;
  partyType: PartyType | null;
  holderId: string | null;
  holderName: string | null;
  accountId: string | null;
  accountName: string | null;
  vaultType: VaultType | null;
  currency: string | null;
  amount: string;
}

interface DemoAccount {
  id: string; displayName: string; accountNumber: string; currency: string; balance: number;
}
interface DemoHolder {
  id: string; dahabNumber: string; canonicalName: string;
  type: "Individual" | "Corporate" | "Trust";
  accounts: DemoAccount[];
}

const VAULTS: { type: VaultType; currencies: string[] }[] = [
  { type: "Cash", currencies: ["LYD", "USD", "EUR", "GBP"] },
  { type: "Bank", currencies: ["LYD", "USD", "EUR", "GBP"] },
];

const DEMO_HOLDERS: DemoHolder[] = [
  {
    id: "H-1001", dahabNumber: "DH-2049-8821", canonicalName: "Khalid Al-Mansour", type: "Individual",
    accounts: [
      { id: "A-1001-LYD", displayName: "Khalid Personal — LYD", accountNumber: "DH•••• 4821", currency: "LYD", balance: 45250 },
      { id: "A-1001-USD", displayName: "Khalid Personal — USD", accountNumber: "DH•••• 4822", currency: "USD", balance: 12500 },
    ],
  },
  {
    id: "H-1002", dahabNumber: "DH-3071-1140", canonicalName: "Al Saraya Trading LLC", type: "Corporate",
    accounts: [
      { id: "A-1002-USD", displayName: "Al Saraya Operating USD", accountNumber: "DH•••• 9932", currency: "USD", balance: 87500 },
      { id: "A-1002-EUR", displayName: "Al Saraya Operating EUR", accountNumber: "DH•••• 9933", currency: "EUR", balance: 32100 },
    ],
  },
  {
    id: "H-1003", dahabNumber: "DH-4188-2207", canonicalName: "Mediterranean Holdings Trust", type: "Trust",
    accounts: [
      { id: "A-1003-GBP", displayName: "Med Holdings Reserve GBP", accountNumber: "DH•••• 7711", currency: "GBP", balance: 21450 },
      { id: "A-1003-EUR", displayName: "Med Holdings Reserve EUR", accountNumber: "DH•••• 7712", currency: "EUR", balance: 18900 },
    ],
  },
  {
    id: "H-1004", dahabNumber: "DH-5023-6612", canonicalName: "Fatima Bensaid", type: "Individual",
    accounts: [
      { id: "A-1004-LYD", displayName: "Fatima Personal — LYD", accountNumber: "DH•••• 5512", currency: "LYD", balance: 8740 },
    ],
  },
];

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  } catch { return `${value.toFixed(2)} ${currency}`; }
}

function createEmptyEntry(type: Side): JournalEntry {
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type, partyType: null, holderId: null, holderName: null,
    accountId: null, accountName: null, vaultType: null, currency: null, amount: "",
  };
}

/* ─── Currency badge ───────────────────────────────────────── */
function CurrencyBadge({ currency, className = "" }: { currency: string; className?: string }) {
  const styles: Record<string, string> = {
    LYD: "bg-gold/15 text-gold border-gold/30",
    USD: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    EUR: "bg-[#7AA8E8]/10 text-[#7AA8E8] border-[#7AA8E8]/25",
    GBP: "bg-[#C394E0]/10 text-[#C394E0] border-[#C394E0]/25",
  };
  const style = styles[currency.toUpperCase()] || "bg-gold/10 text-gold border-gold/20";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wider border ${style} ${className}`}>
      {currency.toUpperCase()}
    </span>
  );
}

/* ─── Inline gold button (matches mock) ────────────────────── */
function PrimaryBtn({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center justify-center h-11 px-6 text-sm font-semibold rounded-lg whitespace-nowrap transition-all focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-50 disabled:pointer-events-none bg-gradient-to-b from-[#E8C570] via-[#D4A857] to-[#A8842F] text-[#14181F] shadow-[0_4px_16px_rgba(212,168,87,0.3),inset_0_1px_0_rgba(255,255,255,0.3)] hover:shadow-[0_6px_24px_rgba(212,168,87,0.45),inset_0_1px_0_rgba(255,255,255,0.4)] ${className}`}
      {...(rest as any)}
    >{children}</motion.button>
  );
}
function SecondaryBtn({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center justify-center h-11 px-6 text-sm font-medium rounded-lg whitespace-nowrap transition-all focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-50 disabled:pointer-events-none bg-surface-2 border border-gold/30 text-text-primary hover:bg-surface-3 hover:border-gold/50 ${className}`}
      {...(rest as any)}
    >{children}</motion.button>
  );
}

/* ─── Card wrapper ─────────────────────────────────────────── */
function PCard({ variant = "default", className = "", children }: { variant?: "default" | "premium"; className?: string; children: React.ReactNode }) {
  const base = "rounded-2xl overflow-hidden relative";
  const v = variant === "premium"
    ? "bg-gradient-to-br from-surface to-surface-2 border border-gold/20 shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(212,168,87,0.08)]"
    : "bg-surface border border-border shadow-[0_4px_16px_rgba(0,0,0,0.25)]";
  return (
    <div className={`${base} ${v} ${className}`}>
      {variant === "premium" && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent pointer-events-none" />
      )}
      {children}
    </div>
  );
}

/* ─── Page component ──────────────────────────────────────── */
function SandboxMultiEntryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isReadOnly = false;

  const [inflowEntries, setInflowEntries] = useState<JournalEntry[]>([createEmptyEntry("inflow")]);
  const [outflowEntries, setOutflowEntries] = useState<JournalEntry[]>([createEmptyEntry("outflow")]);
  const [description, setDescription] = useState("");
  const [valueDate, setValueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | null>(null);
  const [txnId, setTxnId] = useState("");

  const balanceStatus = useMemo(() => {
    const totals = new Map<string, { inflow: number; outflow: number }>();
    const tally = (rows: JournalEntry[], side: Side) => {
      rows.forEach((e) => {
        if (!e.currency || !e.amount) return;
        const amt = parseFloat(e.amount) || 0;
        const cur = totals.get(e.currency) || { inflow: 0, outflow: 0 };
        if (side === "inflow") cur.inflow += amt; else cur.outflow += amt;
        totals.set(e.currency, cur);
      });
    };
    tally(inflowEntries, "inflow"); tally(outflowEntries, "outflow");
    const breakdown: { currency: string; inflow: number; outflow: number; diff: number; balanced: boolean; progress: number }[] = [];
    totals.forEach((val, currency) => {
      const diff = val.inflow - val.outflow;
      const max = Math.max(val.inflow, val.outflow); const min = Math.min(val.inflow, val.outflow);
      const progress = max === 0 ? 0 : min / max;
      breakdown.push({ currency, inflow: val.inflow, outflow: val.outflow, diff, balanced: Math.abs(diff) < 0.01 && max > 0, progress });
    });
    breakdown.sort((a, b) => a.currency.localeCompare(b.currency));
    const allBalanced = breakdown.length > 0 && breakdown.every((b) => b.balanced);
    const hasEntries = breakdown.length > 0 && breakdown.some((b) => b.inflow > 0 || b.outflow > 0);
    const unbalancedCount = breakdown.filter((b) => !b.balanced).length;
    return { breakdown, allBalanced, hasEntries, unbalancedCount };
  }, [inflowEntries, outflowEntries]);

  const inflowSubtotals = useMemo(() => sideSubtotals(inflowEntries), [inflowEntries]);
  const outflowSubtotals = useMemo(() => sideSubtotals(outflowEntries), [outflowEntries]);

  const allRowsComplete =
    inflowEntries.every((e) => e.partyType && parseFloat(e.amount) > 0) &&
    outflowEntries.every((e) => e.partyType && parseFloat(e.amount) > 0);

  const canSubmit = balanceStatus.allBalanced && balanceStatus.hasEntries && allRowsComplete && description.trim().length > 0 && !isReadOnly;

  function addEntry(type: Side) {
    if (type === "inflow") setInflowEntries((p) => [...p, createEmptyEntry("inflow")]);
    else setOutflowEntries((p) => [...p, createEmptyEntry("outflow")]);
  }
  function removeEntry(type: Side, id: string) {
    if (type === "inflow" && inflowEntries.length > 1) setInflowEntries((p) => p.filter((e) => e.id !== id));
    else if (type === "outflow" && outflowEntries.length > 1) setOutflowEntries((p) => p.filter((e) => e.id !== id));
  }
  function updateEntry(type: Side, id: string, updates: Partial<JournalEntry>) {
    const setter = type === "inflow" ? setInflowEntries : setOutflowEntries;
    setter((p) => p.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    const payload = {
      transaction_date: valueDate,
      narration: description.trim(),
      teller: user?.email || null,
      inflows: inflowEntries.map((r) => ({
        party_type: r.partyType, holder_id: r.holderId, account_id: r.accountId,
        vault_type: r.vaultType, currency_code: r.currency, amount: parseFloat(r.amount),
      })),
      outflows: outflowEntries.map((r) => ({
        party_type: r.partyType, holder_id: r.holderId, account_id: r.accountId,
        vault_type: r.vaultType, currency_code: r.currency, amount: parseFloat(r.amount),
      })),
      idempotency_key: crypto.randomUUID(),
    };
    try {
      try {
        await apiFetch("/sandbox/multi-entry/validate", { method: "POST", body: JSON.stringify(payload) });
      } catch (e) {
        if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 0)) throw e;
      }
      let id: string | null = null;
      try {
        const res = await apiFetch<{ tx_number?: string; transaction_number?: string; id?: string }>(
          "/sandbox/multi-entry/post",
          { method: "POST", body: JSON.stringify(payload) },
        );
        id = res.tx_number || res.transaction_number || res.id || null;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 0)) {
          id = `SBX-${Date.now().toString(36).toUpperCase()}`;
        } else throw e;
      }
      const finalId = id || `SBX-${Date.now().toString(36).toUpperCase()}`;
      setTxnId(finalId);
      setResult("success");
      toast.success("Sandbox transaction posted successfully.", { description: `Transaction number: ${finalId}` });
    } catch (e: any) {
      toast.error("Failed to post sandbox transaction", { description: e?.message ?? String(e) });
    } finally {
      setIsSubmitting(false);
    }
  }

  function reset() {
    setInflowEntries([createEmptyEntry("inflow")]);
    setOutflowEntries([createEmptyEntry("outflow")]);
    setDescription(""); setValueDate(new Date().toISOString().slice(0, 10));
    setResult(null); setTxnId("");
  }

  if (result) {
    return (
      <ResultScreen
        txnId={txnId} inflowEntries={inflowEntries} outflowEntries={outflowEntries}
        description={description} valueDate={valueDate}
        balanceBreakdown={balanceStatus.breakdown}
        onNew={reset}
        onView={() => navigate({ to: "/app/transactions" })}
        onDashboard={() => navigate({ to: "/app" })}
      />
    );
  }

  return (
    <div className="pb-32">
      {/* Shared sandbox header: banner + consumer picker + tabs */}
      <SandboxNav />

      {/* Breadcrumb + Title */}
      <div className="max-w-6xl mx-auto space-y-3 mb-6">
        <div className="flex items-center gap-2 text-sm">
          <Link to="/app" className="text-text-secondary hover:text-gold transition-colors">Dashboard</Link>
          <span className="text-text-secondary">/</span>
          <Link to="/app/transactions" className="text-text-secondary hover:text-gold transition-colors">Transactions</Link>
          <span className="text-text-secondary">/</span>
          <span className="text-text-primary font-medium">Sandbox Multi-Entry</span>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-gold" />
              <span className="text-[10px] tracking-[0.25em] uppercase text-gold font-medium">
                Multi-Entry Transaction
              </span>
            </div>
            <h1 className="text-3xl font-serif font-semibold text-text-primary">
              Composite Journal Entry
            </h1>
            <p className="text-sm text-text-secondary mt-1.5 max-w-2xl">
              Record multiple inflows and outflows in one transaction. Every currency must balance to zero before posting.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SideColumn
            side="inflow" entries={inflowEntries} subtotals={inflowSubtotals} isReadOnly={isReadOnly}
            onAdd={() => addEntry("inflow")} onUpdate={(id, u) => updateEntry("inflow", id, u)} onRemove={(id) => removeEntry("inflow", id)}
          />
          <SideColumn
            side="outflow" entries={outflowEntries} subtotals={outflowSubtotals} isReadOnly={isReadOnly}
            onAdd={() => addEntry("outflow")} onUpdate={(id, u) => updateEntry("outflow", id, u)} onRemove={(id) => removeEntry("outflow", id)}
          />
        </div>

        <BalancePanel status={balanceStatus} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PCard className="p-6 lg:col-span-2">
            <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-secondary font-medium mb-3">
              <FileText className="w-3.5 h-3.5 text-gold" />
              Reference & Memo <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Customer FX trade — USD/EUR cash deposit against LYD credit"
              rows={3} disabled={isReadOnly}
              className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition-all resize-none disabled:opacity-50"
            />
          </PCard>

          <PCard className="p-6">
            <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-secondary font-medium mb-3">
              <Calendar className="w-3.5 h-3.5 text-gold" />
              Value Date
            </label>
            <input
              type="date" value={valueDate} onChange={(e) => setValueDate(e.target.value)}
              disabled={isReadOnly}
              className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition-all disabled:opacity-50"
            />
          </PCard>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border/60 z-20">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
          <SecondaryBtn onClick={() => reset()}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Clear Form
          </SecondaryBtn>
          <div className="flex items-center gap-4">
            <div className="text-xs text-text-secondary hidden sm:block">
              {inflowEntries.length + outflowEntries.length} entries · {balanceStatus.breakdown.length}{" "}
              {balanceStatus.breakdown.length === 1 ? "currency" : "currencies"}
            </div>
            <PrimaryBtn onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className="min-w-[220px]">
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#14181F] border-t-transparent rounded-full animate-spin" />
                  Posting Journal...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Post Sandbox Transaction
                </span>
              )}
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Side column ─────────────────────────────────────────── */
function SideColumn({
  side, entries, subtotals, isReadOnly, onAdd, onUpdate, onRemove,
}: {
  side: Side; entries: JournalEntry[];
  subtotals: { currency: string; total: number }[];
  isReadOnly: boolean;
  onAdd: () => void;
  onUpdate: (id: string, u: Partial<JournalEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const isInflow = side === "inflow";
  const tone = isInflow
    ? { text: "text-emerald-400", bgSoft: "bg-emerald-500/10", borderSoft: "border-emerald-500/30",
        accent: "from-emerald-500/10 via-transparent to-transparent",
        dashBorder: "border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/5",
        Icon: ArrowDownToLine, sign: "+", title: "Inflows", sub: "Money received into DAHAB" }
    : { text: "text-red-400", bgSoft: "bg-red-500/10", borderSoft: "border-red-500/30",
        accent: "from-red-500/10 via-transparent to-transparent",
        dashBorder: "border-red-500/40 hover:border-red-400 hover:bg-red-500/5",
        Icon: ArrowUpFromLine, sign: "−", title: "Outflows", sub: "Money disbursed from DAHAB" };
  const Icon = tone.Icon;
  return (
    <PCard className="p-0">
      <div className={`relative px-5 py-4 border-b border-border bg-gradient-to-r ${tone.accent}`}>
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl ${tone.bgSoft} border ${tone.borderSoft} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-5 h-5 ${tone.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className={`text-xl font-serif font-semibold ${tone.text}`}>{tone.title}</h2>
              <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${tone.bgSoft} ${tone.text} border ${tone.borderSoft}`}>
                {entries.length}
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">{tone.sub}</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <AnimatePresence initial={false}>
          {entries.map((entry, idx) => (
            <motion.div key={entry.id} layout
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
              transition={{ duration: 0.2 }}
            >
              <EntryRow
                entry={entry} index={idx}
                onUpdate={(u) => onUpdate(entry.id, u)}
                onRemove={() => onRemove(entry.id)}
                canRemove={entries.length > 1}
                isReadOnly={isReadOnly}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        <button type="button" onClick={onAdd} disabled={isReadOnly}
          className={`w-full py-3 rounded-xl border-2 border-dashed ${tone.dashBorder} ${tone.text} text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}>
          <Plus className="w-4 h-4" /> Add {isInflow ? "inflow" : "outflow"} row
        </button>
      </div>

      {subtotals.length > 0 && (
        <div className="px-5 py-3 border-t border-border bg-surface-2/30 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Subtotal</span>
          {subtotals.map((s) => (
            <span key={s.currency} className={`text-sm font-semibold tabular-nums ${tone.text}`}>
              {tone.sign}{formatCurrency(s.total, s.currency)}{" "}
              <span className="text-[10px] text-text-secondary font-normal">{s.currency}</span>
            </span>
          ))}
        </div>
      )}
    </PCard>
  );
}

/* ─── Entry row ───────────────────────────────────────────── */
function EntryRow({ entry, index, onUpdate, onRemove, canRemove, isReadOnly }: {
  entry: JournalEntry; index: number;
  onUpdate: (updates: Partial<JournalEntry>) => void;
  onRemove: () => void; canRemove: boolean; isReadOnly: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isInflow = entry.type === "inflow";
  const accentBar = isInflow ? "bg-emerald-500" : "bg-red-500";
  const hasParty = !!entry.partyType;
  return (
    <div className="relative rounded-xl bg-surface-2 border border-border overflow-hidden transition-all hover:border-gold/30 group">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentBar}`} />
      <div className="p-4 pl-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">
            {isInflow ? "Inflow" : "Outflow"} #{index + 1}
          </span>
          {canRemove && !isReadOnly && (
            <button onClick={onRemove}
              className="p-1.5 rounded-md text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="Remove entry" aria-label="Remove entry">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button type="button" onClick={() => !isReadOnly && setPickerOpen(true)} disabled={isReadOnly}
          className={`w-full text-left p-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            hasParty ? "bg-surface border border-border hover:border-gold/40"
                     : "bg-surface/40 border-2 border-dashed border-border hover:border-gold/50 hover:bg-gold/5"}`}>
          {hasParty ? <PartyDisplay entry={entry} /> : (
            <div className="flex items-center gap-3 py-1">
              <div className="w-9 h-9 rounded-full bg-gold/10 border border-dashed border-gold/30 flex items-center justify-center flex-shrink-0">
                <Search className="w-4 h-4 text-gold" />
              </div>
              <div>
                <p className="text-sm text-text-primary font-medium">
                  {isInflow ? "Select source..." : "Select destination..."}
                </p>
                <p className="text-[11px] text-text-secondary">Customer account or vault</p>
              </div>
            </div>
          )}
        </button>

        {entry.currency && (
          <div className="flex items-stretch gap-2">
            <div className="flex items-center px-3 rounded-lg bg-surface border border-border flex-shrink-0">
              <CurrencyBadge currency={entry.currency} />
            </div>
            <input
              type="number" value={entry.amount}
              onChange={(e) => onUpdate({ amount: e.target.value })}
              placeholder="0.00" step="0.01" min="0" disabled={isReadOnly}
              className="flex-1 bg-surface border border-border rounded-lg px-4 py-2.5 text-lg font-semibold text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition-all tabular-nums text-right disabled:opacity-50"
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {pickerOpen && (
          <PartyPickerModal side={entry.type} onClose={() => setPickerOpen(false)}
            onSelect={(party) => { onUpdate(party); setPickerOpen(false); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function PartyDisplay({ entry }: { entry: JournalEntry }) {
  if (entry.partyType === "vault") {
    const IconComp = entry.vaultType === "Cash" ? Wallet : Landmark;
    const accent = entry.vaultType === "Cash"
      ? "bg-gold/10 border-gold/30 text-gold"
      : "bg-sky-500/10 border-sky-500/30 text-sky-400";
    return (
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 ${accent}`}>
          <IconComp className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary truncate">{entry.vaultType} Vault</p>
          <p className="text-[11px] text-text-secondary truncate">{entry.currency} Reserve</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center flex-shrink-0">
        <User className="w-4 h-4 text-gold" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary truncate">{entry.holderName}</p>
        <p className="text-[11px] text-text-secondary truncate font-mono">{entry.accountName}</p>
      </div>
    </div>
  );
}

/* ─── Balance panel ───────────────────────────────────────── */
function BalancePanel({ status }: {
  status: {
    breakdown: { currency: string; inflow: number; outflow: number; diff: number; balanced: boolean; progress: number }[];
    allBalanced: boolean; hasEntries: boolean; unbalancedCount: number;
  };
}) {
  const isBalanced = status.allBalanced && status.hasEntries;
  const heroBg = isBalanced
    ? "from-emerald-500/15 via-emerald-500/5 to-transparent"
    : status.hasEntries
      ? "from-amber-500/15 via-amber-500/5 to-transparent"
      : "from-surface-2 via-surface to-surface";
  return (
    <PCard variant="premium" className="p-0 border-2 border-border">
      <div className={`relative px-6 py-5 bg-gradient-to-r ${heroBg} border-b border-border`}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
            isBalanced ? "bg-emerald-500/15 border-2 border-emerald-500/40"
                       : status.hasEntries ? "bg-amber-500/15 border-2 border-amber-500/40"
                                           : "bg-surface-2 border-2 border-border"}`}>
            {isBalanced ? <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              : status.hasEntries ? <Scale className="w-6 h-6 text-amber-400" />
              : <Scale className="w-6 h-6 text-text-secondary" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-medium">Balance Check</span>
            </div>
            <h3 className={`text-xl font-serif font-semibold ${
              isBalanced ? "text-emerald-400" : status.hasEntries ? "text-amber-400" : "text-text-primary"}`}>
              {isBalanced ? "All currencies balanced"
                : status.hasEntries
                  ? `${status.unbalancedCount} ${status.unbalancedCount === 1 ? "currency" : "currencies"} unbalanced`
                  : "Awaiting entries"}
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {isBalanced ? "Inflows and outflows match perfectly. Ready to post."
                : status.hasEntries ? "Adjust amounts so each currency nets to zero before posting."
                : "Add inflows and outflows above. Each currency must balance independently."}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {status.breakdown.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {status.breakdown.map((b) => <CurrencyBalanceTile key={b.currency} balance={b} />)}
          </div>
        ) : (
          <div className="p-8 text-center border border-dashed border-border rounded-xl bg-surface-2/40">
            <ArrowRightLeft className="w-8 h-8 text-text-secondary mx-auto mb-3" />
            <p className="text-sm text-text-secondary">
              Add inflows and outflows above to see the live balance check.
            </p>
          </div>
        )}
      </div>
    </PCard>
  );
}

function CurrencyBalanceTile({ balance }: {
  balance: { currency: string; inflow: number; outflow: number; diff: number; balanced: boolean; progress: number };
}) {
  const { balanced, currency, inflow, outflow, diff, progress } = balance;
  const tileBg = balanced ? "bg-emerald-500/5 border-emerald-500/40" : "bg-amber-500/5 border-amber-500/40";
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className={`p-4 rounded-xl border-2 transition-all ${tileBg}`}>
      <div className="flex items-center justify-between mb-3">
        <CurrencyBadge currency={currency} />
        {balanced ? (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> Balanced
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-amber-400">
            <AlertCircle className="w-3 h-3" /> Off by{" "}
            <span className="tabular-nums">{formatCurrency(Math.abs(diff), currency)}</span>
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-3">
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(progress * 100, 4)}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={`h-full rounded-full ${balanced ? "bg-emerald-400" : "bg-amber-400"}`} />
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1 text-text-secondary"><ArrowDownToLine className="w-3 h-3 text-emerald-400" /> In</span>
          <span className="font-semibold text-emerald-400 tabular-nums">+{formatCurrency(inflow, currency)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1 text-text-secondary"><ArrowUpFromLine className="w-3 h-3 text-red-400" /> Out</span>
          <span className="font-semibold text-red-400 tabular-nums">−{formatCurrency(outflow, currency)}</span>
        </div>
        <div className="pt-1.5 border-t border-border/60 flex justify-between items-center">
          <span className="text-text-secondary font-medium">Net</span>
          <span className={`font-bold tabular-nums ${balanced ? "text-emerald-400" : "text-amber-400"}`}>
            {diff >= 0 ? "+" : "−"}{formatCurrency(Math.abs(diff), currency)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Party picker modal ──────────────────────────────────── */
function PartyPickerModal({ side, onClose, onSelect }: {
  side: Side; onClose: () => void; onSelect: (party: Partial<JournalEntry>) => void;
}) {
  const [tab, setTab] = useState<"accounts" | "vaults">("accounts");
  const [searchTerm, setSearchTerm] = useState("");
  const searchResults = searchTerm.length > 1
    ? DEMO_HOLDERS.filter((h) =>
        h.canonicalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.dahabNumber.toLowerCase().includes(searchTerm.toLowerCase()))
    : DEMO_HOLDERS;
  const sideLabel = side === "inflow" ? "Source" : "Destination";
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40" />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto">
          <div className="px-6 py-5 border-b border-border flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-medium">Select {sideLabel}</span>
              <h2 className="text-lg font-serif font-semibold text-text-primary mt-0.5">
                Choose a customer account or vault
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 pt-4 flex gap-2 border-b border-border">
            <button onClick={() => setTab("accounts")}
              className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${tab === "accounts" ? "text-gold border-gold" : "text-text-secondary border-transparent hover:text-text-primary"}`}>
              Customer Accounts
            </button>
            <button onClick={() => setTab("vaults")}
              className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${tab === "vaults" ? "text-gold border-gold" : "text-text-secondary border-transparent hover:text-text-primary"}`}>
              Vaults
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {tab === "accounts" ? (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search holders by name or DAHAB number..." autoFocus
                    className="w-full bg-surface-2 border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30" />
                </div>
                <div className="space-y-2">
                  {searchResults.map((holder) =>
                    holder.accounts.map((account) => (
                      <button key={account.id}
                        onClick={() => onSelect({
                          partyType: "account", holderId: holder.id, holderName: holder.canonicalName,
                          accountId: account.id, accountName: account.displayName,
                          currency: account.currency, vaultType: null,
                        })}
                        className="w-full flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-border hover:border-gold/40 hover:bg-surface-2/80 transition-all text-left group">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
                            {holder.type === "Corporate" ? <Building2 className="w-5 h-5 text-gold" />
                              : holder.type === "Trust" ? <Briefcase className="w-5 h-5 text-gold" />
                              : <User className="w-5 h-5 text-gold" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-text-primary truncate group-hover:text-gold transition-colors">
                              {holder.canonicalName}
                            </p>
                            <p className="text-xs text-text-secondary truncate">{account.displayName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <CurrencyBadge currency={account.currency} />
                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wider text-text-secondary">Balance</p>
                            <p className="text-sm font-semibold text-text-primary tabular-nums">
                              {formatCurrency(account.balance, account.currency)}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-text-secondary group-hover:text-gold transition-colors" />
                        </div>
                      </button>
                    )))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {VAULTS.map((vault) =>
                  vault.currencies.map((currency) => (
                    <button key={`${vault.type}-${currency}`}
                      onClick={() => onSelect({
                        partyType: "vault", vaultType: vault.type, currency,
                        holderId: null, holderName: null, accountId: null, accountName: null,
                      })}
                      className="w-full flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-border hover:border-gold/40 hover:bg-surface-2/80 transition-all text-left group">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          vault.type === "Cash" ? "bg-gold/10 border border-gold/20" : "bg-sky-500/10 border border-sky-500/20"}`}>
                          {vault.type === "Cash" ? <Wallet className="w-5 h-5 text-gold" /> : <Landmark className="w-5 h-5 text-sky-400" />}
                        </div>
                        <div>
                          <p className="font-medium text-text-primary group-hover:text-gold transition-colors">{vault.type} Vault</p>
                          <p className="text-xs text-text-secondary">{currency} Reserve</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <CurrencyBadge currency={currency} />
                        <ArrowRight className="w-4 h-4 text-text-secondary group-hover:text-gold transition-colors" />
                      </div>
                    </button>
                  )))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ─── Result screen ───────────────────────────────────────── */
function ResultScreen({
  txnId, inflowEntries, outflowEntries, description, valueDate, balanceBreakdown,
  onNew, onView, onDashboard,
}: {
  txnId: string; inflowEntries: JournalEntry[]; outflowEntries: JournalEntry[];
  description: string; valueDate: string;
  balanceBreakdown: { currency: string; inflow: number; outflow: number; diff: number; balanced: boolean; progress: number }[];
  onNew: () => void; onView: () => void; onDashboard: () => void;
}) {
  const totalEntries = inflowEntries.length + outflowEntries.length;
  const postedAt = new Date();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto py-10 space-y-6">
      <PCard variant="premium" className="p-8 text-center">
        <div className="relative">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 16 }}
            className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-500/10 border-2 border-emerald-500/40 shadow-[0_0_40px_rgba(52,211,153,0.25)]">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </motion.div>
          <h1 className="text-3xl font-serif font-semibold text-text-primary mb-2">Sandbox transaction posted successfully.</h1>
          <p className="text-text-secondary mb-6 max-w-md mx-auto">
            {totalEntries} balanced ledger entries recorded under one transaction.
          </p>
          <div className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-5 py-3 rounded-xl bg-surface-2 border border-border">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-text-secondary">Transaction</span>
              <span className="font-mono font-semibold text-gold">{txnId}</span>
            </div>
            <span className="w-px h-4 bg-border hidden sm:block" />
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-text-secondary" />
              <span className="text-xs text-text-primary">
                {postedAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        </div>
      </PCard>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
        <PCard className="p-0">
          <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"><ArrowDownToLine className="w-5 h-5 text-emerald-400" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-serif font-semibold text-emerald-400">Inflows</h3>
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">{inflowEntries.length}</span>
                </div>
                <p className="text-[11px] text-text-secondary">Money received into DAHAB</p>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {inflowEntries.map((e, idx) => <ReceiptEntry key={e.id} entry={e} index={idx} />)}
          </div>
        </PCard>

        <div className="hidden lg:flex items-center justify-center px-2">
          <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="w-12 h-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
            <ArrowRightLeft className="w-5 h-5 text-gold" />
          </motion.div>
        </div>

        <PCard className="p-0">
          <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-red-500/10 via-transparent to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center"><ArrowUpFromLine className="w-5 h-5 text-red-400" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-serif font-semibold text-red-400">Outflows</h3>
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400">{outflowEntries.length}</span>
                </div>
                <p className="text-[11px] text-text-secondary">Money disbursed from DAHAB</p>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {outflowEntries.map((e, idx) => <ReceiptEntry key={e.id} entry={e} index={idx} />)}
          </div>
        </PCard>
      </div>

      {balanceBreakdown.length > 0 && (
        <PCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Scale className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-serif font-semibold text-text-primary">Currency Balance Proof</h3>
              <p className="text-[11px] text-text-secondary">Each currency settled to zero net flow</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {balanceBreakdown.map((b) => (
              <div key={b.currency} className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/30">
                <div className="flex items-center justify-between mb-3">
                  <CurrencyBadge currency={b.currency} />
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" /> Settled
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-400 font-semibold tabular-nums">+{formatCurrency(b.inflow, b.currency)}</span>
                  <ArrowRightLeft className="w-3 h-3 text-text-secondary mx-1" />
                  <span className="text-red-400 font-semibold tabular-nums">−{formatCurrency(b.outflow, b.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </PCard>
      )}

      <PCard className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-secondary font-medium mb-2">
              <FileText className="w-3.5 h-3.5 text-gold" /> Reference & Memo
            </div>
            <p className="text-sm text-text-primary leading-relaxed">{description}</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-secondary font-medium mb-2">
              <Calendar className="w-3.5 h-3.5 text-gold" /> Value Date
            </div>
            <p className="text-sm text-text-primary font-medium">
              {new Date(valueDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
      </PCard>

      <div className="flex flex-col sm:flex-row gap-3">
        <SecondaryBtn onClick={onNew} className="flex-1">New Composite Entry</SecondaryBtn>
        <SecondaryBtn onClick={onView} className="flex-1">View Transactions</SecondaryBtn>
        <PrimaryBtn onClick={onDashboard} className="flex-1">Back to Dashboard</PrimaryBtn>
      </div>
    </motion.div>
  );
}

function ReceiptEntry({ entry, index }: { entry: JournalEntry; index: number }) {
  const isInflow = entry.type === "inflow";
  const tone = isInflow ? "text-emerald-400" : "text-red-400";
  const stripeBg = isInflow ? "bg-emerald-500" : "bg-red-500";
  const indexBg = isInflow
    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
    : "bg-red-500/10 border-red-500/30 text-red-400";
  const isVault = entry.partyType === "vault";
  const IconComp = isVault ? (entry.vaultType === "Cash" ? Wallet : Landmark) : User;
  const partyName = isVault ? `${entry.vaultType} Vault` : entry.holderName || "—";
  const partySub = isVault ? `${entry.currency} Reserve` : entry.accountName || "";
  const amt = parseFloat(entry.amount) || 0;
  return (
    <motion.div layout initial={{ opacity: 0, x: isInflow ? -8 : 8 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * index + 0.15 }}
      className="relative rounded-lg bg-surface-2/60 border border-border overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${stripeBg}`} />
      <div className="p-3 pl-4 flex items-center gap-3">
        <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold tabular-nums flex-shrink-0 ${indexBg}`}>
          {index + 1}
        </div>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isVault && entry.vaultType === "Bank" ? "bg-sky-500/10 border border-sky-500/30 text-sky-400" : "bg-gold/10 border border-gold/30 text-gold"}`}>
            <IconComp className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary truncate">{partyName}</p>
            <p className="text-[10px] text-text-secondary truncate">{partySub}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-semibold tabular-nums ${tone}`}>
            {isInflow ? "+" : "−"}{entry.currency ? formatCurrency(amt, entry.currency) : "—"}
          </p>
          {entry.currency && <p className="text-[10px] text-text-secondary mt-0.5">{entry.currency}</p>}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────── */
function sideSubtotals(entries: JournalEntry[]): { currency: string; total: number }[] {
  const map = new Map<string, number>();
  entries.forEach((e) => {
    if (e.currency && e.amount) {
      const amt = parseFloat(e.amount) || 0;
      if (amt > 0) map.set(e.currency, (map.get(e.currency) || 0) + amt);
    }
  });
  return Array.from(map.entries())
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
