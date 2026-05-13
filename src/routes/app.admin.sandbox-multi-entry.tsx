import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Plus, Trash2, Search, AlertCircle, CheckCircle2,
  ArrowDownToLine, ArrowUpFromLine, Shield, X, Scale, Calendar, FileText,
  Beaker, RotateCcw, User, Building2, Briefcase, Wallet, Landmark,
  ChevronRight, Receipt, Sparkles, BookOpen, Eye, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/admin/sandbox-multi-entry")({
  component: CompositeJournalEntryPage,
  head: () => ({ meta: [{ title: "Composite Journal Entry — Sandbox — DAHAB" }] }),
});

/* ─── Types ─────────────────────────────────────────────────── */
type CurrencyCode = "LYD" | "USD" | "EUR" | "GBP" | "TRY" | "AED";
type EntityType =
  | "CUSTOMER_ACCOUNT" | "CASH_VAULT" | "BANK_VAULT" | "TREASURY_VAULT"
  | "PAYABLE" | "RECEIVABLE";
type EntrySide = "INFLOW" | "OUTFLOW";
type RoleMode = "Admin" | "Teller" | "Auditor";

interface SelectableEntity {
  entityId: string;
  holderId?: string;
  entityType: EntityType;
  displayName: string;
  accountName: string;
  dahabNumber?: string;
  holderType?: string;
  currency: CurrencyCode;
  balance: number;
  status: "Active";
  isSandbox: true;
}

interface DraftLine {
  localId: string;
  side: EntrySide;
  entityId: string | null;
  amount: string;
  memo: string;
}

interface PostedLine {
  ledgerLineId: string;
  txId: string;
  lineNumber: number;
  side: EntrySide;
  entityId: string;
  entityType: EntityType;
  displayName: string;
  accountName: string;
  currency: CurrencyCode;
  amount: number;
  signedAmount: number;
  debit: number;
  credit: number;
  balanceBefore: number;
  balanceAfter: number;
  memo?: string;
  postedAt: string;
  valueDate: string;
  status: "COMPLETED";
}

interface PostedJournal {
  txId: string;
  status: "COMPLETED";
  postedAt: string;
  valueDate: string;
  memo: string;
  postedBy: string;
  branchId: string;
  ledgerRows: PostedLine[];
}

/* ─── Mock seed data ────────────────────────────────────────── */
const CURRENCIES: CurrencyCode[] = ["LYD", "USD", "EUR", "GBP", "TRY", "AED"];

const INDIVIDUAL_NAMES = [
  "Khalid Al-Mansour","Omar Mukhtar","Layla Benghazi","Yusuf Ibn Rashid","Aisha Al-Tarhuni",
  "Mahmoud El-Senussi","Nour Al-Fitouri","Salem Al-Gharyani","Huda Al-Misrati","Fathi Al-Zawi",
  "Mariam Al-Kilani","Ibrahim Al-Darnawi","Nadia Al-Houni","Tarek Al-Jebali","Samira Al-Obeidi",
  "Abdulrahman Al-Ferjani","Amal Al-Werfalli","Nasser Al-Maghrabi","Rania Al-Karami","Ziad Al-Tajouri",
  "Farah Al-Akhdar","Mustafa Al-Qasimi","Iman Al-Saadi","Bilal Al-Mahjoub","Safa Al-Atrash",
  "Hamza Al-Lafi","Lina Al-Sherif","Jamal Al-Khoms","Yasmin Al-Sabratha","Anas Al-Mahmoudi",
];
const CORPORATE_NAMES = [
  "Al-Madina Trading Co.","Sahara Logistics Group","Tripoli Import House","Benghazi Steel Works",
  "Mediterranean Foods Ltd.","Green Mountain Energy","Libyan Digital Services","North Africa Shipping",
  "Derna Construction Group","Misrata Textile Company","Golden Crescent Motors","Atlas Medical Supplies",
];
const TRUST_NAMES = [
  "Fatima El-Zahra Trust","Al-Noor Education Trust","Crescent Family Trust",
  "Benghazi Heritage Trust","Oasis Charitable Trust",
];
const FAMILY_OFFICE_NAMES = [
  "Tripoli Family Office","Cyrenaica Capital Office","Al-Andalus Private Office",
];

const ACCOUNT_LABELS_INDIVIDUAL = [
  "Personal Savings","Daily Account","Travel Wallet","Side Business",
  "Dubai Account","Turkey Sourcing","Family Distribution",
];
const ACCOUNT_LABELS_CORPORATE = [
  "Main Operating","Payroll","Reserve","Vendor Settlement","Treasury",
];
const ACCOUNT_LABELS_TRUST = [
  "Education Reserve","Investment Reserve","Family Distribution","Endowment",
];

// Deterministic pseudo-random so balances stay stable across renders.
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
function pick<T>(arr: T[], r: () => number): T { return arr[Math.floor(r() * arr.length)]; }
function balanceFor(holderType: string, currency: CurrencyCode, r: () => number): number {
  if (holderType === "Individual") {
    if (currency === "LYD") return Math.round(1000 + r() * 249000);
    if (currency === "TRY" || currency === "AED") return Math.round(2000 + r() * 498000);
    return Math.round(500 + r() * 149500);
  }
  if (holderType === "Corporate") return Math.round(25000 + r() * 4975000);
  return Math.round(50000 + r() * 9950000);
}

function buildSeedCustomers(): { holders: { id: string; name: string; type: string; dahabNumber: string }[]; accounts: SelectableEntity[] } {
  const r = seededRng(42);
  const holders: { id: string; name: string; type: string; dahabNumber: string }[] = [];
  const accounts: SelectableEntity[] = [];
  let idx = 1001;
  function addHolder(name: string, type: string, accountLabels: string[], minAccts: number, maxAccts: number) {
    const id = `H-${idx}`;
    const dahab = `DH-${1000 + Math.floor(r() * 8999)}-${1000 + Math.floor(r() * 8999)}`;
    holders.push({ id, name, type, dahabNumber: dahab });
    const n = minAccts + Math.floor(r() * (maxAccts - minAccts + 1));
    const usedCcy = new Set<CurrencyCode>();
    for (let i = 0; i < n; i++) {
      let ccy = pick(CURRENCIES, r);
      let guard = 0;
      while (usedCcy.has(ccy) && guard < 6) { ccy = pick(CURRENCIES, r); guard++; }
      usedCcy.add(ccy);
      const label = pick(accountLabels, r);
      accounts.push({
        entityId: `A-${idx}-${ccy}-${i}`,
        holderId: id,
        entityType: "CUSTOMER_ACCOUNT",
        displayName: name,
        accountName: `${label} ${ccy}`,
        dahabNumber: dahab,
        holderType: type,
        currency: ccy,
        balance: balanceFor(type, ccy, r),
        status: "Active",
        isSandbox: true,
      });
    }
    idx++;
  }
  INDIVIDUAL_NAMES.forEach((n) => addHolder(n, "Individual", ACCOUNT_LABELS_INDIVIDUAL, 1, 3));
  CORPORATE_NAMES.forEach((n) => addHolder(n, "Corporate", ACCOUNT_LABELS_CORPORATE, 2, 4));
  TRUST_NAMES.forEach((n) => addHolder(n, "Trust", ACCOUNT_LABELS_TRUST, 1, 3));
  FAMILY_OFFICE_NAMES.forEach((n) => addHolder(n, "Family Office", ACCOUNT_LABELS_TRUST, 2, 3));
  return { holders, accounts };
}

const VAULT_SEED: { type: "CASH_VAULT" | "BANK_VAULT" | "TREASURY_VAULT"; label: string; balances: Record<CurrencyCode, number> }[] = [
  { type: "CASH_VAULT", label: "Cash Vault", balances: { LYD: 2_500_000, USD: 450_000, EUR: 320_000, GBP: 90_000, TRY: 1_200_000, AED: 180_000 } },
  { type: "BANK_VAULT", label: "Bank Vault", balances: { LYD: 8_400_000, USD: 1_200_000, EUR: 950_000, GBP: 380_000, TRY: 3_100_000, AED: 540_000 } },
  { type: "TREASURY_VAULT", label: "Treasury Vault", balances: { LYD: 15_000_000, USD: 2_500_000, EUR: 2_100_000, GBP: 800_000, TRY: 5_000_000, AED: 1_250_000 } },
];

const PAYABLE_SEED: Record<CurrencyCode, number> = { LYD: 350_000, USD: 90_000, EUR: 75_000, GBP: 30_000, TRY: 600_000, AED: 120_000 };
const RECEIVABLE_SEED: Record<CurrencyCode, number> = { LYD: 275_000, USD: 65_000, EUR: 55_000, GBP: 22_000, TRY: 420_000, AED: 95_000 };

function buildSeed(): SelectableEntity[] {
  const { accounts } = buildSeedCustomers();
  const out: SelectableEntity[] = [...accounts];
  for (const v of VAULT_SEED) {
    for (const ccy of CURRENCIES) {
      out.push({
        entityId: `${v.type}-${ccy}`,
        entityType: v.type,
        displayName: `${v.label} ${ccy}`,
        accountName: `${v.label} — ${ccy}`,
        currency: ccy,
        balance: v.balances[ccy],
        status: "Active",
        isSandbox: true,
      });
    }
  }
  for (const ccy of CURRENCIES) {
    out.push({
      entityId: `PAYABLE-${ccy}`, entityType: "PAYABLE",
      displayName: `Sandbox Payable ${ccy}`, accountName: `Payable — ${ccy}`,
      currency: ccy, balance: PAYABLE_SEED[ccy], status: "Active", isSandbox: true,
    });
    out.push({
      entityId: `RECEIVABLE-${ccy}`, entityType: "RECEIVABLE",
      displayName: `Sandbox Receivable ${ccy}`, accountName: `Receivable — ${ccy}`,
      currency: ccy, balance: RECEIVABLE_SEED[ccy], status: "Active", isSandbox: true,
    });
  }
  return out;
}

/* ─── Persistence (sandbox-only) ────────────────────────────── */
const LS_KEY = "dahab.composite-journal.v1";
interface Persist {
  entities: SelectableEntity[];
  journals: PostedJournal[];
}
function loadPersist(): Persist {
  if (typeof localStorage === "undefined") return { entities: buildSeed(), journals: [] };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { entities: buildSeed(), journals: [] };
    const parsed = JSON.parse(raw) as Persist;
    if (!parsed.entities?.length) return { entities: buildSeed(), journals: parsed.journals ?? [] };
    return parsed;
  } catch { return { entities: buildSeed(), journals: [] }; }
}
function savePersist(p: Persist) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
}

/* ─── Helpers ───────────────────────────────────────────────── */
const fmt = (n: number, ccy?: string) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + (ccy ? ` ${ccy}` : "");
const round2 = (n: number) => Math.round(n * 100) / 100;

function entityIcon(t: EntityType) {
  switch (t) {
    case "CUSTOMER_ACCOUNT": return User;
    case "CASH_VAULT": return Wallet;
    case "BANK_VAULT": return Landmark;
    case "TREASURY_VAULT": return Building2;
    case "PAYABLE": return ArrowUpFromLine;
    case "RECEIVABLE": return ArrowDownToLine;
  }
}
function entityTypeLabel(t: EntityType) {
  return ({
    CUSTOMER_ACCOUNT: "Customer", CASH_VAULT: "Cash Vault", BANK_VAULT: "Bank Vault",
    TREASURY_VAULT: "Treasury Vault", PAYABLE: "Payable", RECEIVABLE: "Receivable",
  } as const)[t];
}
function ccyClass(ccy: CurrencyCode) {
  return ({
    LYD: "text-amber-300 bg-amber-500/10 border-amber-500/30",
    USD: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    EUR: "text-sky-300 bg-sky-500/10 border-sky-500/30",
    GBP: "text-violet-300 bg-violet-500/10 border-violet-500/30",
    TRY: "text-rose-300 bg-rose-500/10 border-rose-500/30",
    AED: "text-teal-300 bg-teal-500/10 border-teal-500/30",
  } as const)[ccy];
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}
function newTxId() {
  return `TXN-${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
}

/* For PAYABLE: inflow=credit, outflow=debit. For all others: inflow=debit, outflow=credit. */
function debitCreditFor(side: EntrySide, etype: EntityType, amt: number) {
  const inflow = side === "INFLOW";
  if (etype === "PAYABLE") {
    return inflow ? { debit: 0, credit: amt } : { debit: amt, credit: 0 };
  }
  return inflow ? { debit: amt, credit: 0 } : { debit: 0, credit: amt };
}

/* ─── Page component ────────────────────────────────────────── */
type View = "builder" | "review" | "posting" | "receipt" | "ledger" | "transactionDetail";

function CompositeJournalEntryPage() {
  const [{ entities, journals }, setStore] = useState<Persist>(() => loadPersist());
  useEffect(() => { savePersist({ entities, journals }); }, [entities, journals]);

  const [role, setRole] = useState<RoleMode>("Admin");
  const [view, setView] = useState<View>("builder");
  const [valueDate, setValueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [
    { localId: uid("L"), side: "INFLOW", entityId: null, amount: "", memo: "" },
    { localId: uid("L"), side: "OUTFLOW", entityId: null, amount: "", memo: "" },
  ]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAck, setReviewAck] = useState(false);
  const [postedTx, setPostedTx] = useState<PostedJournal | null>(null);
  const [openTxId, setOpenTxId] = useState<string | null>(null);
  const [exampleOpen, setExampleOpen] = useState(false);

  const entityById = useMemo(() => {
    const m = new Map<string, SelectableEntity>();
    entities.forEach((e) => m.set(e.entityId, e));
    return m;
  }, [entities]);

  const inflowLines = lines.filter((l) => l.side === "INFLOW");
  const outflowLines = lines.filter((l) => l.side === "OUTFLOW");

  /* ─── Validation & summary ────────────────────────────────── */
  const currencySummary = useMemo(() => {
    const map = new Map<CurrencyCode, { totalIn: number; totalOut: number }>();
    for (const l of lines) {
      const e = l.entityId ? entityById.get(l.entityId) : null;
      const amt = parseFloat(l.amount);
      if (!e || !isFinite(amt) || amt <= 0) continue;
      const cur = map.get(e.currency) ?? { totalIn: 0, totalOut: 0 };
      if (l.side === "INFLOW") cur.totalIn += amt; else cur.totalOut += amt;
      map.set(e.currency, cur);
    }
    return Array.from(map.entries()).map(([currency, v]) => ({
      currency,
      totalInflow: round2(v.totalIn),
      totalOutflow: round2(v.totalOut),
      difference: round2(v.totalIn - v.totalOut),
      balanced: Math.abs(v.totalIn - v.totalOut) < 0.005,
    }));
  }, [lines, entityById]);

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (role === "Auditor") errs.push("Auditor role is read-only.");
    if (!memo.trim()) errs.push("Main memo is required.");
    if (inflowLines.length === 0) errs.push("Add at least one inflow row.");
    if (outflowLines.length === 0) errs.push("Add at least one outflow row.");
    lines.forEach((l, i) => {
      const e = l.entityId ? entityById.get(l.entityId) : null;
      const label = `${l.side === "INFLOW" ? "Inflow" : "Outflow"} #${
        (l.side === "INFLOW" ? inflowLines : outflowLines).indexOf(l) + 1
      }`;
      if (!e) errs.push(`Select an account or vault for ${label}.`);
      const amt = parseFloat(l.amount);
      if (!isFinite(amt) || amt <= 0) errs.push(`${label} amount must be greater than zero.`);
    });
    if (currencySummary.length === 0 && inflowLines.length && outflowLines.length)
      errs.push("Awaiting valid amounts.");
    currencySummary.forEach((s) => {
      if (!s.balanced) {
        const diff = s.difference;
        if (diff > 0) errs.push(`${s.currency} is not balanced. Add ${fmt(Math.abs(diff))} more outflow or reduce inflow.`);
        else errs.push(`${s.currency} is not balanced. Add ${fmt(Math.abs(diff))} more inflow or reduce outflow.`);
      }
    });
    return { ok: errs.length === 0, errs };
  }, [role, memo, lines, currencySummary, inflowLines, outflowLines, entityById]);

  /* ─── Mutators ────────────────────────────────────────────── */
  const readOnly = role === "Auditor";
  function addRow(side: EntrySide) {
    if (readOnly) return;
    setLines((ls) => [...ls, { localId: uid("L"), side, entityId: null, amount: "", memo: "" }]);
  }
  function updateRow(id: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.localId === id ? { ...l, ...patch } : l)));
  }
  function removeRow(id: string) {
    if (readOnly) return;
    setLines((ls) => ls.filter((l) => l.localId !== id));
  }
  function clearForm() {
    setMemo(""); setReviewAck(false);
    setLines([
      { localId: uid("L"), side: "INFLOW", entityId: null, amount: "", memo: "" },
      { localId: uid("L"), side: "OUTFLOW", entityId: null, amount: "", memo: "" },
    ]);
  }

  /* ─── Posting ─────────────────────────────────────────────── */
  function performPost() {
    if (!validation.ok) return;
    setView("posting");
    setTimeout(() => {
      const txId = newTxId();
      const postedAt = new Date().toISOString();
      const ent = new Map(entities.map((e) => [e.entityId, { ...e }]));
      const ledgerRows: PostedLine[] = [];
      let lineNo = 1;
      const sorted = [...lines].sort((a, b) => (a.side === b.side ? 0 : a.side === "INFLOW" ? -1 : 1));
      for (const l of sorted) {
        const e = ent.get(l.entityId!)!;
        const amt = round2(parseFloat(l.amount));
        const before = e.balance;
        const after = round2(l.side === "INFLOW" ? before + amt : before - amt);
        e.balance = after;
        const dc = debitCreditFor(l.side, e.entityType, amt);
        ledgerRows.push({
          ledgerLineId: uid("LG"),
          txId,
          lineNumber: lineNo++,
          side: l.side,
          entityId: e.entityId,
          entityType: e.entityType,
          displayName: e.displayName,
          accountName: e.accountName,
          currency: e.currency,
          amount: amt,
          signedAmount: l.side === "INFLOW" ? amt : -amt,
          debit: dc.debit,
          credit: dc.credit,
          balanceBefore: before,
          balanceAfter: after,
          memo: l.memo || undefined,
          postedAt,
          valueDate,
          status: "COMPLETED",
        });
      }
      const journal: PostedJournal = {
        txId, status: "COMPLETED", postedAt, valueDate, memo,
        postedBy: role === "Teller" ? "Sandbox Teller" : role === "Auditor" ? "Sandbox Auditor" : "Sandbox Admin",
        branchId: "Sandbox Branch", ledgerRows,
      };
      setStore({ entities: Array.from(ent.values()), journals: [journal, ...journals] });
      setPostedTx(journal);
      setReviewOpen(false);
      setReviewAck(false);
      setView("receipt");
      toast.success("Composite journal posted", { description: `${journal.ledgerRows.length} ledger entries · ${txId}` });
    }, 1100);
  }

  function resetSandbox() {
    setStore({ entities: buildSeed(), journals: [] });
    clearForm();
    setPostedTx(null);
    setOpenTxId(null);
    setView("builder");
    toast.success("Sandbox reset to seed state.");
  }

  /* ─── Try Examples ────────────────────────────────────────── */
  function loadExample(key: string) {
    if (readOnly) return;
    setExampleOpen(false);
    function make(side: EntrySide, eid: string, amount: number, m?: string): DraftLine {
      return { localId: uid("L"), side, entityId: eid, amount: String(amount), memo: m ?? "" };
    }
    if (key === "vault_usd") {
      setMemo("Sandbox vault rebalance — USD cash moved to bank vault.");
      setLines([make("INFLOW", "BANK_VAULT-USD", 25000), make("OUTFLOW", "CASH_VAULT-USD", 25000)]);
    } else if (key === "eur_split") {
      const eurCustAccts = entities.filter((e) => e.entityType === "CUSTOMER_ACCOUNT" && e.currency === "EUR").slice(0, 2);
      if (eurCustAccts.length < 2) return toast.error("Not enough EUR customer accounts");
      setMemo("EUR incoming wire split across two customer accounts.");
      setLines([
        make("INFLOW", eurCustAccts[0].entityId, 30000),
        make("INFLOW", eurCustAccts[1].entityId, 20000),
        make("OUTFLOW", "BANK_VAULT-EUR", 50000),
      ]);
    } else if (key === "lyd_payroll") {
      const lyds = entities.filter((e) => e.entityType === "CUSTOMER_ACCOUNT" && e.currency === "LYD" && e.holderType === "Individual").slice(0, 8);
      if (lyds.length < 8) return toast.error("Not enough LYD individual accounts");
      const splits = [12000, 11500, 14000, 10500, 12500, 13000, 10500, 11000];
      const total = splits.reduce((a, b) => a + b, 0);
      const corp = entities.find((e) => e.entityType === "CUSTOMER_ACCOUNT" && e.currency === "LYD" && e.holderType === "Corporate");
      if (!corp) return toast.error("No corporate LYD account available");
      setMemo("Salary disbursement from corporate payroll account to multiple employee accounts.");
      setLines([
        ...lyds.map((a, i) => make("INFLOW", a.entityId, splits[i])),
        make("OUTFLOW", corp.entityId, total),
      ]);
    } else if (key === "usd_recv") {
      setMemo("Customer USD cash received against receivable settlement.");
      setLines([make("INFLOW", "CASH_VAULT-USD", 10000), make("OUTFLOW", "RECEIVABLE-USD", 10000)]);
    } else if (key === "lyd_pay") {
      const lyd = entities.find((e) => e.entityType === "CUSTOMER_ACCOUNT" && e.currency === "LYD");
      if (!lyd) return;
      setMemo("Sandbox payable settlement in LYD.");
      setLines([make("INFLOW", lyd.entityId, 50000), make("OUTFLOW", "PAYABLE-LYD", 50000)]);
    }
    toast.success("Example loaded");
  }

  /* ─── Render ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-app,#0B0F14)] text-text-primary pb-32">
      {/* Sticky banner */}
      <div className="sticky top-0 z-30 backdrop-blur-md bg-[#0B0F14]/85 border-b border-amber-500/30">
        <div className="max-w-7xl mx-auto px-5 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-[260px]">
            <Beaker className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <div className="text-sm font-semibold text-amber-300">
                Sandbox Mode — Composite Journal Entry
              </div>
              <div className="text-xs text-amber-200/70">
                Use this page to test multi-entry transaction posting and ledger effects. No production balances are affected.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-text-secondary" />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RoleMode)}
              className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold"
            >
              <option>Admin</option><option>Teller</option><option>Auditor</option>
            </select>
            <button
              type="button"
              onClick={resetSandbox}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-text-secondary hover:text-amber-300 hover:border-amber-500/40 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Sandbox
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="max-w-7xl mx-auto px-5 pt-6">
        <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
          <Link to="/app" className="hover:text-gold">Admin</Link>
          <ChevronRight className="h-3 w-3" />
          <span>Sandbox</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-text-primary font-medium">Composite Journal Entry</span>
          {(view === "transactionDetail" || view === "ledger") && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-text-primary font-medium">{view === "ledger" ? "Transaction Posting" : `TXN Detail`}</span>
            </>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display, inherit)" }}>
          Composite Journal Entry
        </h1>
        <p className="text-sm text-text-secondary mt-1 max-w-3xl">
          Create one balanced multi-entry transaction with multiple inflows and outflows. Every currency must balance separately before posting.
        </p>

        {/* Internal toggle */}
        <div className="mt-5 inline-flex p-1 rounded-lg bg-surface border border-border">
          {([
            { v: "builder", label: "Composite Entry", icon: FileText },
            { v: "ledger", label: "Transaction Posting / Ledger", icon: BookOpen },
          ] as const).map((t) => {
            const active = view === t.v || (t.v === "builder" && (view === "review" || view === "receipt" || view === "posting"))
              || (t.v === "ledger" && view === "transactionDetail");
            const Icon = t.icon;
            return (
              <button
                key={t.v}
                onClick={() => { setView(t.v); setOpenTxId(null); }}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition",
                  active ? "bg-gold text-[#14181F]" : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 mt-6 space-y-6">
        {(view === "builder" || view === "review" || view === "posting") && (
          <BuilderView
            role={role} readOnly={readOnly}
            valueDate={valueDate} setValueDate={setValueDate}
            memo={memo} setMemo={setMemo}
            lines={lines} updateRow={updateRow} removeRow={removeRow} addRow={addRow}
            entityById={entityById}
            inflowLines={inflowLines} outflowLines={outflowLines}
            currencySummary={currencySummary} validation={validation}
            onPickerOpen={(id) => setPickerFor(id)}
            onReview={() => { setReviewOpen(true); }}
            onLoadExample={() => setExampleOpen(true)}
          />
        )}

        {view === "receipt" && postedTx && (
          <ReceiptView
            tx={postedTx}
            onNew={() => { clearForm(); setPostedTx(null); setView("builder"); }}
            onLedger={() => setView("ledger")}
            onDetail={() => { setOpenTxId(postedTx.txId); setView("transactionDetail"); }}
          />
        )}

        {view === "ledger" && (
          <LedgerView
            journals={journals} entities={entities}
            onOpen={(txId) => { setOpenTxId(txId); setView("transactionDetail"); }}
            onBack={() => setView("builder")}
          />
        )}

        {view === "transactionDetail" && openTxId && (
          <DetailView
            tx={journals.find((j) => j.txId === openTxId)}
            onBackLedger={() => setView("ledger")}
            onNew={() => { clearForm(); setPostedTx(null); setView("builder"); }}
          />
        )}
      </div>

      {/* Picker modal */}
      <AnimatePresence>
        {pickerFor && (
          <PickerModal
            entities={entities}
            line={lines.find((l) => l.localId === pickerFor)!}
            onClose={() => setPickerFor(null)}
            onSelect={(eid) => { updateRow(pickerFor, { entityId: eid }); setPickerFor(null); }}
          />
        )}
      </AnimatePresence>

      {/* Review modal */}
      <AnimatePresence>
        {reviewOpen && (
          <ReviewModal
            role={role}
            valueDate={valueDate} memo={memo}
            lines={lines} entityById={entityById}
            currencySummary={currencySummary}
            ack={reviewAck} setAck={setReviewAck}
            onClose={() => { setReviewOpen(false); setReviewAck(false); }}
            onConfirm={performPost}
          />
        )}
      </AnimatePresence>

      {/* Posting overlay */}
      <AnimatePresence>
        {view === "posting" && <PostingOverlay />}
      </AnimatePresence>

      {/* Example dropdown */}
      <AnimatePresence>
        {exampleOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-24 px-4"
            onClick={() => setExampleOpen(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              className="card-futur w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold" />Try an Example</div>
                <button onClick={() => setExampleOpen(false)}><X className="h-4 w-4 text-text-secondary" /></button>
              </div>
              <div className="space-y-2">
                {[
                  ["vault_usd", "USD vault rebalance", "Bank Vault USD ← Cash Vault USD"],
                  ["eur_split", "EUR multi-party split", "Bank EUR → 2 customer EUR accts"],
                  ["lyd_payroll", "LYD payroll disbursement", "Corporate LYD → 8 employees"],
                  ["usd_recv", "USD receivable settlement", "Cash USD ← Receivable USD"],
                  ["lyd_pay", "LYD payable settlement", "Customer LYD → Payable LYD"],
                ].map(([k, l, d]) => (
                  <button key={k} onClick={() => loadExample(k)}
                    className="w-full text-left rounded-lg border border-border bg-surface hover:border-gold/40 p-3">
                    <div className="text-sm font-semibold">{l}</div>
                    <div className="text-xs text-text-secondary">{d}</div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Builder ───────────────────────────────────────────────── */
interface BuilderProps {
  role: RoleMode; readOnly: boolean;
  valueDate: string; setValueDate: (s: string) => void;
  memo: string; setMemo: (s: string) => void;
  lines: DraftLine[]; updateRow: (id: string, p: Partial<DraftLine>) => void;
  removeRow: (id: string) => void; addRow: (s: EntrySide) => void;
  entityById: Map<string, SelectableEntity>;
  inflowLines: DraftLine[]; outflowLines: DraftLine[];
  currencySummary: { currency: CurrencyCode; totalInflow: number; totalOutflow: number; difference: number; balanced: boolean }[];
  validation: { ok: boolean; errs: string[] };
  onPickerOpen: (id: string) => void;
  onReview: () => void;
  onLoadExample: () => void;
}
function BuilderView(p: BuilderProps) {
  return (
    <>
      {/* Header card */}
      <div className="card-futur p-5 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Transaction Header</h2>
          <button
            onClick={p.onLoadExample}
            disabled={p.readOnly}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gold/30 text-gold hover:bg-gold/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="h-3.5 w-3.5" /> Try example
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Value Date" icon={Calendar}>
            <input type="date" value={p.valueDate} onChange={(e) => p.setValueDate(e.target.value)}
              disabled={p.readOnly}
              className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-gold" />
          </Field>
          <Field label="Teller">
            <div className="text-sm py-2">Sandbox Teller</div>
          </Field>
          <Field label="Branch">
            <div className="text-sm py-2">Sandbox Branch</div>
          </Field>
          <Field label="Mode">
            <div className="inline-flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-gold/10 text-gold border border-gold/30 w-fit">
              <FileText className="h-3 w-3" /> Composite Multi Entry
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Main Memo / Narration" required>
            <input value={p.memo} onChange={(e) => p.setMemo(e.target.value)}
              disabled={p.readOnly}
              placeholder="Example: Multi-party USD settlement under one composite journal."
              className="w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-gold" />
          </Field>
        </div>
      </div>

      {/* Inflows */}
      <SideCard
        side="INFLOW" title="Inflows"
        subtitle="Value received into the selected customer account, vault, payable, or receivable."
        lines={p.inflowLines} entityById={p.entityById}
        onPickerOpen={p.onPickerOpen} updateRow={p.updateRow} removeRow={p.removeRow}
        addRow={() => p.addRow("INFLOW")} readOnly={p.readOnly}
      />

      {/* Outflows */}
      <SideCard
        side="OUTFLOW" title="Outflows"
        subtitle="Value disbursed from the selected customer account, vault, payable, or receivable."
        lines={p.outflowLines} entityById={p.entityById}
        onPickerOpen={p.onPickerOpen} updateRow={p.updateRow} removeRow={p.removeRow}
        addRow={() => p.addRow("OUTFLOW")} readOnly={p.readOnly}
      />

      {/* Balance check */}
      <BalancePanel summary={p.currencySummary} />

      {/* Ledger preview */}
      <LedgerPreview lines={p.lines} entityById={p.entityById} />

      {/* Validation messages */}
      {p.validation.errs.length > 0 && (
        <div className="card-futur p-4 rounded-xl border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2 text-amber-300 font-semibold text-sm">
            <AlertCircle className="h-4 w-4" /> Validation
          </div>
          <ul className="text-xs text-amber-200/80 list-disc pl-5 space-y-1">
            {p.validation.errs.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
            {p.validation.errs.length > 6 && <li>+{p.validation.errs.length - 6} more…</li>}
          </ul>
        </div>
      )}

      {/* Action bar */}
      <div className="sticky bottom-0 -mx-5 px-5 py-3 backdrop-blur-md bg-[#0B0F14]/85 border-t border-border flex items-center justify-between">
        <div className="text-xs text-text-secondary">
          {p.lines.length} legs · {p.currencySummary.length} currencies ·{" "}
          <span className={p.validation.ok ? "text-emerald-400" : "text-amber-300"}>
            {p.validation.ok ? "Ready to post" : "Not ready"}
          </span>
        </div>
        <button
          onClick={p.onReview}
          disabled={!p.validation.ok}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-gold text-[#14181F] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Review &amp; Post <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

function Field({ label, icon: Icon, required, children }: { label: string; icon?: any; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-secondary font-medium mb-1.5 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />} {label}{required && <span className="text-amber-400">*</span>}
      </div>
      {children}
    </div>
  );
}

/* ─── Side card (inflow/outflow) ─────────────────────────────── */
function SideCard({
  side, title, subtitle, lines, entityById, onPickerOpen, updateRow, removeRow, addRow, readOnly,
}: {
  side: EntrySide; title: string; subtitle: string;
  lines: DraftLine[]; entityById: Map<string, SelectableEntity>;
  onPickerOpen: (id: string) => void;
  updateRow: (id: string, p: Partial<DraftLine>) => void;
  removeRow: (id: string) => void;
  addRow: () => void; readOnly: boolean;
}) {
  const accent = side === "INFLOW" ? "emerald" : "red";
  const Icon = side === "INFLOW" ? ArrowDownToLine : ArrowUpFromLine;
  return (
    <div className={cn("card-futur p-5 rounded-xl border-l-4",
      side === "INFLOW" ? "border-l-emerald-500/60" : "border-l-red-500/60")}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <div className={cn("flex items-center gap-2 font-semibold",
            side === "INFLOW" ? "text-emerald-300" : "text-red-300")}>
            <Icon className="h-4 w-4" /> {title}
          </div>
          <div className="text-xs text-text-secondary mt-1 max-w-2xl">{subtitle}</div>
        </div>
        <button
          onClick={addRow} disabled={readOnly}
          className={cn("inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border disabled:opacity-50",
            side === "INFLOW"
              ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
              : "border-red-500/40 text-red-300 hover:bg-red-500/10")}
        >
          <Plus className="h-3.5 w-3.5" /> Add {side === "INFLOW" ? "inflow" : "outflow"} row
        </button>
      </div>
      {lines.length === 0 && (
        <div className="text-xs text-text-secondary text-center py-6 border border-dashed border-border rounded-lg">
          No {side === "INFLOW" ? "inflow" : "outflow"} rows yet.
        </div>
      )}
      <div className="space-y-2">
        {lines.map((l, idx) => {
          const e = l.entityId ? entityById.get(l.entityId) : null;
          const amt = parseFloat(l.amount);
          const balAfter = e && isFinite(amt) && amt > 0
            ? round2(side === "INFLOW" ? e.balance + amt : e.balance - amt)
            : null;
          return (
            <div key={l.localId} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wider text-text-secondary font-medium">
                  {side === "INFLOW" ? "Inflow" : "Outflow"} #{idx + 1}
                </div>
                <button onClick={() => removeRow(l.localId)} disabled={readOnly}
                  className="text-text-secondary hover:text-red-400 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                <button
                  onClick={() => onPickerOpen(l.localId)} disabled={readOnly}
                  className="md:col-span-5 text-left rounded-md border border-border bg-surface-2 px-3 py-2 hover:border-gold/40 disabled:opacity-50"
                >
                  {e ? (
                    <div className="flex items-start gap-2">
                      <EntityIconBox type={e.entityType} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{e.displayName}</div>
                        <div className="text-[11px] text-text-secondary truncate">{e.accountName} · {entityTypeLabel(e.entityType)}</div>
                      </div>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(e.currency))}>{e.currency}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-text-secondary text-sm">
                      <span>Select party / vault / payable / receivable…</span>
                      <Search className="h-4 w-4" />
                    </div>
                  )}
                </button>
                <div className="md:col-span-3">
                  <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Current balance</div>
                  <div className="text-sm tabular-nums">{e ? fmt(e.balance, e.currency) : "—"}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Amount</div>
                  <input
                    type="number" inputMode="decimal" min={0} step="0.01"
                    value={l.amount} onChange={(ev) => updateRow(l.localId, { amount: ev.target.value })}
                    disabled={readOnly || !e}
                    placeholder="0.00"
                    className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:border-gold"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-secondary mb-1">Balance after</div>
                  <div className={cn("text-sm tabular-nums", balAfter !== null && balAfter < 0 && "text-amber-300")}>
                    {balAfter !== null && e ? fmt(balAfter, e.currency) : "—"}
                  </div>
                </div>
              </div>
              <input
                value={l.memo} onChange={(ev) => updateRow(l.localId, { memo: ev.target.value })}
                disabled={readOnly}
                placeholder="Row memo (optional)"
                className="mt-2 w-full bg-surface-2 border border-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EntityIconBox({ type }: { type: EntityType }) {
  const Icon = entityIcon(type);
  const cls = type === "CUSTOMER_ACCOUNT" ? "bg-gold/15 text-gold border-gold/30"
    : type === "CASH_VAULT" ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
    : type === "BANK_VAULT" ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
    : type === "TREASURY_VAULT" ? "bg-violet-500/10 text-violet-300 border-violet-500/30"
    : type === "PAYABLE" ? "bg-red-500/10 text-red-300 border-red-500/30"
    : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  return (
    <div className={cn("flex items-center justify-center h-7 w-7 shrink-0 rounded-md border", cls)}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

/* ─── Balance panel ─────────────────────────────────────────── */
function BalancePanel({ summary }: { summary: { currency: CurrencyCode; totalInflow: number; totalOutflow: number; difference: number; balanced: boolean }[] }) {
  if (summary.length === 0) {
    return (
      <div className="card-futur p-5 rounded-xl">
        <div className="flex items-center gap-2 font-semibold mb-1"><Scale className="h-4 w-4 text-gold" />Currency Balance Check</div>
        <div className="text-xs text-text-secondary">Awaiting entries — Add inflow and outflow rows to begin balance validation.</div>
      </div>
    );
  }
  const allOk = summary.every((s) => s.balanced);
  return (
    <div className={cn("card-futur p-5 rounded-xl border", allOk ? "border-emerald-500/40" : "border-amber-500/40")}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-semibold">
          <Scale className={cn("h-4 w-4", allOk ? "text-emerald-400" : "text-amber-400")} />
          Currency Balance Check
        </div>
        <div className={cn("text-xs font-semibold", allOk ? "text-emerald-300" : "text-amber-300")}>
          {allOk ? "All currencies balanced — ready to review and post." : "Each currency must have equal inflow and outflow totals before posting."}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {summary.map((s) => (
          <div key={s.currency} className={cn("rounded-lg border p-3 bg-surface",
            s.balanced ? "border-emerald-500/40" : "border-amber-500/40")}>
            <div className="flex items-center justify-between mb-2">
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(s.currency))}>{s.currency}</span>
              {s.balanced ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-amber-400" />}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><div className="text-text-secondary">Inflow</div><div className="tabular-nums text-emerald-300">{fmt(s.totalInflow)}</div></div>
              <div><div className="text-text-secondary">Outflow</div><div className="tabular-nums text-red-300">{fmt(s.totalOutflow)}</div></div>
              <div><div className="text-text-secondary">Diff</div><div className={cn("tabular-nums", s.balanced ? "text-emerald-300" : "text-amber-300")}>{fmt(s.difference)}</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Ledger preview (pre-post) ─────────────────────────────── */
function LedgerPreview({ lines, entityById }: { lines: DraftLine[]; entityById: Map<string, SelectableEntity> }) {
  const rows = useMemo(() => {
    const ent = new Map(Array.from(entityById.values()).map((e) => [e.entityId, { ...e }]));
    let n = 1;
    const sorted = [...lines].sort((a, b) => (a.side === b.side ? 0 : a.side === "INFLOW" ? -1 : 1));
    return sorted.map((l) => {
      const e = l.entityId ? ent.get(l.entityId) : null;
      const amt = parseFloat(l.amount);
      if (!e || !isFinite(amt) || amt <= 0) return null;
      const before = e.balance;
      const after = round2(l.side === "INFLOW" ? before + amt : before - amt);
      e.balance = after;
      const dc = debitCreditFor(l.side, e.entityType, amt);
      return {
        n: n++, side: l.side, e, amt, signed: l.side === "INFLOW" ? amt : -amt,
        before, after, debit: dc.debit, credit: dc.credit, memo: l.memo,
      };
    }).filter(Boolean) as Array<{ n: number; side: EntrySide; e: SelectableEntity; amt: number; signed: number; before: number; after: number; debit: number; credit: number; memo: string }>;
  }, [lines, entityById]);

  return (
    <div className="card-futur p-5 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4 text-gold" />Ledger Preview</div>
        <div className="text-[11px] text-text-secondary">Sandbox preview only · final backend posting rules will apply when connected.</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-text-secondary text-center py-6">No preview yet — add valid rows to see how this would post.</div>
      ) : (
        <div className="overflow-auto -mx-2">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-text-secondary uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-left">Side</th>
                <th className="px-2 py-1 text-left">Entity</th>
                <th className="px-2 py-1 text-left">Type</th>
                <th className="px-2 py-1 text-left">Ccy</th>
                <th className="px-2 py-1 text-right">Debit</th>
                <th className="px-2 py-1 text-right">Credit</th>
                <th className="px-2 py-1 text-right">Signed</th>
                <th className="px-2 py-1 text-right">Bal Before</th>
                <th className="px-2 py-1 text-right">Bal After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n} className="border-t border-border/50">
                  <td className="px-2 py-1.5">{r.n}</td>
                  <td className={cn("px-2 py-1.5 font-semibold", r.side === "INFLOW" ? "text-emerald-300" : "text-red-300")}>{r.side}</td>
                  <td className="px-2 py-1.5 max-w-[180px] truncate">{r.e.displayName} <span className="text-text-secondary">· {r.e.accountName}</span></td>
                  <td className="px-2 py-1.5 text-text-secondary">{entityTypeLabel(r.e.entityType)}</td>
                  <td className="px-2 py-1.5"><span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(r.e.currency))}>{r.e.currency}</span></td>
                  <td className="px-2 py-1.5 text-right">{r.debit ? fmt(r.debit) : "—"}</td>
                  <td className="px-2 py-1.5 text-right">{r.credit ? fmt(r.credit) : "—"}</td>
                  <td className={cn("px-2 py-1.5 text-right", r.signed >= 0 ? "text-emerald-300" : "text-red-300")}>{fmt(r.signed)}</td>
                  <td className="px-2 py-1.5 text-right text-text-secondary">{fmt(r.before)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(r.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Picker modal ──────────────────────────────────────────── */
function PickerModal({
  entities, line, onClose, onSelect,
}: {
  entities: SelectableEntity[]; line: DraftLine;
  onClose: () => void; onSelect: (eid: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | EntityType>("ALL");
  const [filterCcy, setFilterCcy] = useState<"ALL" | CurrencyCode>("ALL");

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return entities.filter((e) => {
      if (filterType !== "ALL" && e.entityType !== filterType) return false;
      if (filterCcy !== "ALL" && e.currency !== filterCcy) return false;
      if (!ql) return true;
      return (
        e.displayName.toLowerCase().includes(ql) ||
        e.accountName.toLowerCase().includes(ql) ||
        (e.dahabNumber ?? "").toLowerCase().includes(ql) ||
        e.currency.toLowerCase().includes(ql) ||
        entityTypeLabel(e.entityType).toLowerCase().includes(ql)
      );
    }).slice(0, 200);
  }, [entities, q, filterType, filterCcy]);

  const title = line.side === "INFLOW" ? "Select Inflow Destination" : "Select Outflow Source";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        className="card-futur w-full md:max-w-3xl max-h-[88vh] flex flex-col rounded-t-2xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose}><X className="h-4 w-4 text-text-secondary" /></button>
        </div>
        <div className="p-4 space-y-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, account, DAHAB number, currency, type…"
              className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border rounded-md text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ["ALL", "All"], ["CUSTOMER_ACCOUNT", "Customers"], ["CASH_VAULT", "Cash Vaults"],
              ["BANK_VAULT", "Bank Vaults"], ["TREASURY_VAULT", "Treasury Vaults"],
              ["PAYABLE", "Payables"], ["RECEIVABLE", "Receivables"],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilterType(k as any)}
                className={cn("text-xs px-2.5 py-1 rounded-md border transition",
                  filterType === k ? "bg-gold text-[#14181F] border-gold" : "border-border text-text-secondary hover:text-text-primary")}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterCcy("ALL")}
              className={cn("text-[11px] px-2 py-1 rounded-md border", filterCcy === "ALL" ? "bg-gold text-[#14181F] border-gold" : "border-border text-text-secondary")}>All</button>
            {CURRENCIES.map((c) => (
              <button key={c} onClick={() => setFilterCcy(c)}
                className={cn("text-[11px] px-2 py-1 rounded-md border font-bold", filterCcy === c ? "bg-gold text-[#14181F] border-gold" : ccyClass(c))}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-auto flex-1 p-2">
          {filtered.length === 0 && (
            <div className="text-center text-sm text-text-secondary py-10">No matches</div>
          )}
          {filtered.map((e) => (
            <button key={e.entityId} onClick={() => onSelect(e.entityId)}
              className="w-full text-left p-2.5 rounded-md hover:bg-surface-2 flex items-center gap-3 border border-transparent hover:border-gold/30">
              <EntityIconBox type={e.entityType} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold truncate">{e.displayName}</span>
                  <span className="text-[10px] uppercase tracking-wider text-text-secondary">{entityTypeLabel(e.entityType)}</span>
                  {e.dahabNumber && <span className="text-[10px] font-mono text-gold/80">{e.dahabNumber}</span>}
                </div>
                <div className="text-[11px] text-text-secondary truncate">{e.accountName}</div>
              </div>
              <div className="text-right shrink-0">
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(e.currency))}>{e.currency}</span>
                <div className="text-xs tabular-nums mt-1">{fmt(e.balance)}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-text-secondary shrink-0" />
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Review modal ──────────────────────────────────────────── */
function ReviewModal({
  role, valueDate, memo, lines, entityById, currencySummary,
  ack, setAck, onClose, onConfirm,
}: {
  role: RoleMode; valueDate: string; memo: string;
  lines: DraftLine[]; entityById: Map<string, SelectableEntity>;
  currencySummary: { currency: CurrencyCode; totalInflow: number; totalOutflow: number; difference: number; balanced: boolean }[];
  ack: boolean; setAck: (b: boolean) => void;
  onClose: () => void; onConfirm: () => void;
}) {
  const inflows = lines.filter((l) => l.side === "INFLOW");
  const outflows = lines.filter((l) => l.side === "OUTFLOW");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
      onClick={onClose}>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        className="card-futur w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-lg">Review Composite Journal</div>
              <div className="text-xs text-text-secondary">Verify every leg before posting this sandbox transaction.</div>
            </div>
            <button onClick={onClose}><X className="h-4 w-4 text-text-secondary" /></button>
          </div>
          {role === "Teller" && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30">
              <Shield className="h-3.5 w-3.5" /> Teller — Verification Required
            </div>
          )}
        </div>
        <div className="overflow-auto flex-1 p-5 space-y-4 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Stat label="Value Date" value={valueDate} />
            <Stat label="Posted by" value={role === "Teller" ? "Sandbox Teller" : "Sandbox Admin"} />
            <Stat label="Total Legs" value={String(lines.length)} />
            <Stat label="Currencies" value={String(currencySummary.length)} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-text-secondary mb-1">Memo</div>
            <div className="rounded-md border border-border bg-surface p-3">{memo}</div>
          </div>
          <ReviewList title="Inflows" tone="emerald" lines={inflows} entityById={entityById} />
          <ReviewList title="Outflows" tone="red" lines={outflows} entityById={entityById} />
          <div>
            <div className="text-xs uppercase tracking-wider text-text-secondary mb-2">Currency balance proof</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {currencySummary.map((s) => (
                <div key={s.currency} className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(s.currency))}>{s.currency}</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="mt-1 tabular-nums">In {fmt(s.totalInflow)} · Out {fmt(s.totalOutflow)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/80">
            All legs will be posted under one shared transaction ID.
          </div>
        </div>
        <div className="p-5 border-t border-border space-y-3">
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
            <span>I have reviewed every entry, party, amount, memo, and value date. I authorize posting this composite journal to the sandbox ledger.</span>
          </label>
          <div className="flex items-center justify-between gap-3">
            <button onClick={onClose} className="text-xs px-4 py-2 rounded-md border border-border text-text-secondary hover:text-text-primary">
              Back to Edit
            </button>
            <button onClick={onConfirm} disabled={!ack}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-gold text-[#14181F] font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
              {role === "Teller" ? "Submit for Posting" : "Confirm & Post Journal"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReviewList({ title, tone, lines, entityById }: { title: string; tone: "emerald" | "red"; lines: DraftLine[]; entityById: Map<string, SelectableEntity> }) {
  return (
    <div>
      <div className={cn("text-xs uppercase tracking-wider mb-2", tone === "emerald" ? "text-emerald-300" : "text-red-300")}>{title}</div>
      <div className="rounded-md border border-border divide-y divide-border bg-surface text-xs">
        {lines.map((l) => {
          const e = entityById.get(l.entityId!);
          if (!e) return null;
          return (
            <div key={l.localId} className="p-2.5 flex items-center gap-2">
              <EntityIconBox type={e.entityType} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{e.displayName}</div>
                <div className="text-text-secondary truncate">{e.accountName}</div>
              </div>
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(e.currency))}>{e.currency}</span>
              <div className="tabular-nums w-28 text-right">{fmt(parseFloat(l.amount) || 0)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

/* ─── Posting overlay ───────────────────────────────────────── */
function PostingOverlay() {
  const steps = [
    "Validating currency balance",
    "Generating transaction ID",
    "Writing transaction lines",
    "Creating ledger postings",
    "Updating sandbox balances",
    "Creating posting receipt",
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
      <div className="card-futur p-6 rounded-2xl max-w-sm w-full">
        <div className="font-semibold mb-3">Posting journal to sandbox ledger…</div>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <motion.div key={s} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }}
              transition={{ delay: i * 0.12 }} className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> {s}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Receipt ───────────────────────────────────────────────── */
function ReceiptView({ tx, onNew, onLedger, onDetail }: { tx: PostedJournal; onNew: () => void; onLedger: () => void; onDetail: () => void }) {
  const ccys = Array.from(new Set(tx.ledgerRows.map((r) => r.currency)));
  const inflows = tx.ledgerRows.filter((r) => r.side === "INFLOW");
  const outflows = tx.ledgerRows.filter((r) => r.side === "OUTFLOW");
  return (
    <div className="card-futur rounded-xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <div className="text-lg font-semibold">Journal Posted</div>
          <div className="text-xs text-text-secondary">{tx.ledgerRows.length} ledger entries recorded under one transaction.</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-text-secondary">Transaction ID</div>
          <div className="font-mono text-gold text-lg">{tx.txId}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
        <Stat label="Posted at" value={new Date(tx.postedAt).toLocaleString()} />
        <Stat label="Value date" value={tx.valueDate} />
        <Stat label="Posted by" value={tx.postedBy} />
        <Stat label="Currencies" value={ccys.join(" · ")} />
      </div>
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        <ReceiptList title="Inflows" rows={inflows} tone="emerald" />
        <ReceiptList title="Outflows" rows={outflows} tone="red" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onNew} className="px-4 py-2 text-sm rounded-md bg-gold text-[#14181F] font-semibold">New Composite Entry</button>
        <button onClick={onLedger} className="px-4 py-2 text-sm rounded-md border border-border hover:border-gold/40">View Transaction Posting</button>
        <button onClick={onDetail} className="px-4 py-2 text-sm rounded-md border border-border hover:border-gold/40">View Posted Detail</button>
      </div>
    </div>
  );
}
function ReceiptList({ title, rows, tone }: { title: string; rows: PostedLine[]; tone: "emerald" | "red" }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className={cn("px-3 py-2 text-xs uppercase tracking-wider border-b border-border",
        tone === "emerald" ? "text-emerald-300" : "text-red-300")}>{title}</div>
      <div className="divide-y divide-border text-xs">
        {rows.map((r) => (
          <div key={r.ledgerLineId} className="px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0 truncate">{r.displayName} · <span className="text-text-secondary">{r.accountName}</span></div>
            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(r.currency))}>{r.currency}</span>
            <div className="tabular-nums w-24 text-right">{fmt(r.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Ledger view (Transaction Posting) ─────────────────────── */
function LedgerView({
  journals, entities, onOpen, onBack,
}: { journals: PostedJournal[]; entities: SelectableEntity[]; onOpen: (txId: string) => void; onBack: () => void }) {
  const [filter, setFilter] = useState<"ALL" | "TODAY" | CurrencyCode | EntityType>("ALL");

  const allRows = useMemo(() => journals.flatMap((j) => j.ledgerRows), [journals]);
  const today = new Date().toISOString().slice(0, 10);

  const rows = allRows.filter((r) => {
    if (filter === "ALL") return true;
    if (filter === "TODAY") return r.postedAt.slice(0, 10) === today;
    if (CURRENCIES.includes(filter as CurrencyCode)) return r.currency === filter;
    return r.entityType === filter;
  });

  const ccysUsed = Array.from(new Set(allRows.map((r) => r.currency)));
  const lastTx = journals[0];

  // Affected entities snapshot
  const touched = useMemo(() => {
    const m = new Map<string, { entity: SelectableEntity; legs: number; lastTx: string; lastAmount: number; lastAfter: number }>();
    allRows.forEach((r) => {
      const e = entities.find((x) => x.entityId === r.entityId);
      if (!e) return;
      const cur = m.get(r.entityId) ?? { entity: e, legs: 0, lastTx: r.txId, lastAmount: r.signedAmount, lastAfter: r.balanceAfter };
      cur.legs++; cur.lastTx = r.txId; cur.lastAmount = r.signedAmount; cur.lastAfter = r.balanceAfter;
      m.set(r.entityId, cur);
    });
    return Array.from(m.values());
  }, [allRows, entities]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Composite Entry
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <SummaryCard label="Posted Journals" value={String(journals.length)} />
        <SummaryCard label="Ledger Legs" value={String(allRows.length)} />
        <SummaryCard label="Currencies Used" value={ccysUsed.length === 0 ? "—" : ccysUsed.join(" · ")} />
        <SummaryCard label="Last TXN" value={lastTx ? lastTx.txId : "—"} mono />
        <SummaryCard label="Touched Entities" value={String(touched.length)} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ["ALL", "All"], ["TODAY", "Today"],
          ...CURRENCIES.map((c) => [c, c] as const),
          ["CUSTOMER_ACCOUNT", "Customers"], ["CASH_VAULT", "Cash"], ["BANK_VAULT", "Bank"],
          ["TREASURY_VAULT", "Treasury"], ["PAYABLE", "Payables"], ["RECEIVABLE", "Receivables"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k as any)}
            className={cn("text-xs px-2.5 py-1 rounded-md border transition",
              filter === k ? "bg-gold text-[#14181F] border-gold" : "border-border text-text-secondary hover:text-text-primary")}>
            {l}
          </button>
        ))}
      </div>

      {/* Ledger rows */}
      <div className="card-futur rounded-xl">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-gold" />
          <div className="font-semibold">Ledger Posting Rows</div>
          <span className="text-xs text-text-secondary">{rows.length} legs</span>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">
            No posted transactions yet. Build and post a composite journal to see ledger rows here.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-text-secondary uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Posted</th>
                  <th className="px-3 py-2 text-left">TXN</th>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Side</th>
                  <th className="px-2 py-2 text-left">Entity</th>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">Ccy</th>
                  <th className="px-2 py-2 text-right">Debit</th>
                  <th className="px-2 py-2 text-right">Credit</th>
                  <th className="px-2 py-2 text-right">Signed</th>
                  <th className="px-2 py-2 text-right">Bal Before</th>
                  <th className="px-2 py-2 text-right">Bal After</th>
                  <th className="px-2 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ledgerLineId} onClick={() => onOpen(r.txId)}
                    className={cn("border-t border-border/50 cursor-pointer hover:bg-surface-2",
                      r.side === "INFLOW" ? "border-l-2 border-l-emerald-500/40" : "border-l-2 border-l-red-500/40")}>
                    <td className="px-3 py-1.5 text-text-secondary">{new Date(r.postedAt).toLocaleString()}</td>
                    <td className="px-3 py-1.5 font-mono text-gold">{r.txId}</td>
                    <td className="px-2 py-1.5">{r.lineNumber}</td>
                    <td className={cn("px-2 py-1.5 font-semibold", r.side === "INFLOW" ? "text-emerald-300" : "text-red-300")}>{r.side}</td>
                    <td className="px-2 py-1.5 max-w-[200px] truncate">{r.displayName}</td>
                    <td className="px-2 py-1.5 text-text-secondary">{entityTypeLabel(r.entityType)}</td>
                    <td className="px-2 py-1.5"><span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(r.currency))}>{r.currency}</span></td>
                    <td className="px-2 py-1.5 text-right">{r.debit ? fmt(r.debit) : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{r.credit ? fmt(r.credit) : "—"}</td>
                    <td className={cn("px-2 py-1.5 text-right", r.signedAmount >= 0 ? "text-emerald-300" : "text-red-300")}>{fmt(r.signedAmount)}</td>
                    <td className="px-2 py-1.5 text-right text-text-secondary">{fmt(r.balanceBefore)}</td>
                    <td className="px-2 py-1.5 text-right">{fmt(r.balanceAfter)}</td>
                    <td className="px-2 py-1.5"><span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-300 bg-emerald-500/10">Completed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Affected entities */}
      {touched.length > 0 && (
        <div className="card-futur rounded-xl p-5">
          <div className="font-semibold mb-3 flex items-center gap-2"><Eye className="h-4 w-4 text-gold" />Affected Accounts / Vaults</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {touched.map((t) => (
              <div key={t.entity.entityId} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-2">
                  <EntityIconBox type={t.entity.entityType} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{t.entity.displayName}</div>
                    <div className="text-[11px] text-text-secondary truncate">{t.entity.accountName}</div>
                  </div>
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(t.entity.currency))}>{t.entity.currency}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                  <div><div className="text-text-secondary text-[10px]">Balance</div><div className="tabular-nums">{fmt(t.entity.balance)}</div></div>
                  <div><div className="text-text-secondary text-[10px]">Legs</div><div>{t.legs}</div></div>
                  <div className="col-span-2"><div className="text-text-secondary text-[10px]">Last TXN</div><div className="font-mono text-gold text-[11px]">{t.lastTx}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="card-futur rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className={cn("text-sm font-semibold mt-0.5 truncate", mono && "font-mono text-gold")}>{value}</div>
    </div>
  );
}

/* ─── Detail view ───────────────────────────────────────────── */
function DetailView({ tx, onBackLedger, onNew }: { tx?: PostedJournal; onBackLedger: () => void; onNew: () => void }) {
  if (!tx) {
    return (
      <div className="card-futur p-6 rounded-xl text-center text-sm text-text-secondary">
        Transaction not found. <button onClick={onBackLedger} className="text-gold underline ml-1">Back to ledger</button>
      </div>
    );
  }
  const inflows = tx.ledgerRows.filter((r) => r.side === "INFLOW");
  const outflows = tx.ledgerRows.filter((r) => r.side === "OUTFLOW");

  // Currency proof
  const proof = useMemo(() => {
    const m = new Map<CurrencyCode, { in: number; out: number }>();
    tx.ledgerRows.forEach((r) => {
      const c = m.get(r.currency) ?? { in: 0, out: 0 };
      if (r.side === "INFLOW") c.in += r.amount; else c.out += r.amount;
      m.set(r.currency, c);
    });
    return Array.from(m.entries()).map(([currency, v]) => ({
      currency, in: round2(v.in), out: round2(v.out), diff: round2(v.in - v.out), settled: Math.abs(v.in - v.out) < 0.005,
    }));
  }, [tx]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={onBackLedger} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Transaction Posting
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.message("Receipt download is mocked in sandbox.")}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:border-gold/40 inline-flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Mock Download Receipt
          </button>
          <button onClick={onNew} className="text-xs px-3 py-1.5 rounded-md bg-gold text-[#14181F] font-semibold">New Composite Entry</button>
        </div>
      </div>

      <div className="card-futur rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Receipt className="h-3.5 w-3.5" />
              <span>Composite Journal</span>
            </div>
            <div className="font-mono text-gold text-2xl mt-1">{tx.txId}</div>
            <div className="text-xs text-text-secondary mt-1">{tx.memo}</div>
          </div>
          <div className="text-right text-xs">
            <div><span className="text-text-secondary">Status:</span> <span className="text-emerald-300 font-semibold">COMPLETED</span></div>
            <div><span className="text-text-secondary">Posted:</span> {new Date(tx.postedAt).toLocaleString()}</div>
            <div><span className="text-text-secondary">Value Date:</span> {tx.valueDate}</div>
            <div><span className="text-text-secondary">Posted by:</span> {tx.postedBy}</div>
            <div><span className="text-text-secondary">Branch:</span> {tx.branchId}</div>
          </div>
        </div>
      </div>

      {/* T-account view */}
      <div className="grid md:grid-cols-2 gap-3">
        <TAccountCol title="Inflows" tone="emerald" rows={inflows} />
        <TAccountCol title="Outflows" tone="red" rows={outflows} />
      </div>

      {/* Ledger table for this txn */}
      <div className="card-futur rounded-xl">
        <div className="px-5 py-3 border-b border-border font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-gold" /> Ledger Posting (this transaction)
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-text-secondary uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Side</th>
                <th className="px-2 py-2 text-left">Entity</th>
                <th className="px-2 py-2 text-left">Ccy</th>
                <th className="px-2 py-2 text-right">Debit</th>
                <th className="px-2 py-2 text-right">Credit</th>
                <th className="px-2 py-2 text-right">Signed</th>
                <th className="px-2 py-2 text-right">Bal Before</th>
                <th className="px-2 py-2 text-right">Bal After</th>
                <th className="px-2 py-2 text-left">Memo</th>
              </tr>
            </thead>
            <tbody>
              {tx.ledgerRows.map((r) => (
                <tr key={r.ledgerLineId} className="border-t border-border/50">
                  <td className="px-2 py-1.5">{r.lineNumber}</td>
                  <td className={cn("px-2 py-1.5 font-semibold", r.side === "INFLOW" ? "text-emerald-300" : "text-red-300")}>{r.side}</td>
                  <td className="px-2 py-1.5 max-w-[180px] truncate">{r.displayName}</td>
                  <td className="px-2 py-1.5"><span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(r.currency))}>{r.currency}</span></td>
                  <td className="px-2 py-1.5 text-right">{r.debit ? fmt(r.debit) : "—"}</td>
                  <td className="px-2 py-1.5 text-right">{r.credit ? fmt(r.credit) : "—"}</td>
                  <td className={cn("px-2 py-1.5 text-right", r.signedAmount >= 0 ? "text-emerald-300" : "text-red-300")}>{fmt(r.signedAmount)}</td>
                  <td className="px-2 py-1.5 text-right text-text-secondary">{fmt(r.balanceBefore)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(r.balanceAfter)}</td>
                  <td className="px-2 py-1.5 text-text-secondary">{r.memo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Currency proof */}
      <div className="card-futur rounded-xl p-5">
        <div className="font-semibold mb-3 flex items-center gap-2"><Scale className="h-4 w-4 text-gold" />Currency Balance Proof</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {proof.map((p) => (
            <div key={p.currency} className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(p.currency))}>{p.currency}</span>
                <span className="text-[10px] text-emerald-300 font-semibold">SETTLED</span>
              </div>
              <div className="text-xs tabular-nums">In {fmt(p.in)} · Out {fmt(p.out)} · Diff {fmt(p.diff)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function TAccountCol({ title, tone, rows }: { title: string; tone: "emerald" | "red"; rows: PostedLine[] }) {
  return (
    <div className="card-futur rounded-xl">
      <div className={cn("px-4 py-2 border-b border-border text-xs uppercase tracking-wider font-semibold",
        tone === "emerald" ? "text-emerald-300" : "text-red-300")}>{title}</div>
      <div className="divide-y divide-border text-xs">
        {rows.length === 0 && <div className="p-4 text-center text-text-secondary">None</div>}
        {rows.map((r) => (
          <div key={r.ledgerLineId} className="p-3">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary text-[10px] w-5">#{r.lineNumber}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{r.displayName}</div>
                <div className="text-text-secondary truncate">{r.accountName} · {entityTypeLabel(r.entityType)}</div>
              </div>
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", ccyClass(r.currency))}>{r.currency}</span>
              <div className="tabular-nums w-24 text-right">{fmt(r.amount)}</div>
            </div>
            <div className="text-[10px] text-text-secondary mt-1 flex justify-between">
              <span>Before {fmt(r.balanceBefore)}</span><span>After {fmt(r.balanceAfter)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
