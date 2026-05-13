/**
 * Sandbox-only persistent store.
 *
 * Everything in this module is fully isolated from production data.
 * Data lives in localStorage under a single namespaced key. No
 * production accounts, ledgers, balances, transactions, or holders
 * are ever read or written by this module.
 */
import { useSyncExternalStore } from "react";

const LS_KEY = "dahab.sandbox.v1";

export type SandboxAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "contra"
  | "clearing"
  | "test";

export type NormalSide = "debit" | "credit";
export type SandboxTxStatus = "draft" | "validated" | "posted" | "reversed" | "voided";

export interface SandboxConsumer {
  id: string;
  name: string;
  reference?: string;
}

export interface SandboxAccount {
  id: string;
  consumerId: string;
  name: string;
  type: SandboxAccountType;
  normal: NormalSide;
  currency: string;
  openingBalance: number;
  status: "active" | "inactive";
  createdAt: string;
}

export interface SandboxTxLine {
  id: string;
  accountId: string | null;
  debit: number;
  credit: number;
  memo?: string;
  counterparty?: string;
}

export interface SandboxTransaction {
  id: string;
  consumerId: string;
  title: string;
  date: string;
  description: string;
  reference: string;
  type: string;
  status: SandboxTxStatus;
  lines: SandboxTxLine[];
  postedAt?: string;
  reversedBy?: string;
  reverseOf?: string;
  createdAt: string;
}

export interface SandboxLedgerEntry {
  id: string;
  consumerId: string;
  accountId: string;
  txId: string;
  txReference: string;
  postedAt: string;
  debit: number;
  credit: number;
  memo?: string;
  status: SandboxTxStatus;
}

export interface SandboxState {
  selectedConsumerId: string | null;
  consumers: SandboxConsumer[];
  accounts: SandboxAccount[];
  transactions: SandboxTransaction[];
  ledger: SandboxLedgerEntry[];
}

const EMPTY: SandboxState = {
  selectedConsumerId: null,
  consumers: [],
  accounts: [],
  transactions: [],
  ledger: [],
};

function load(): SandboxState {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as SandboxState) };
  } catch {
    return EMPTY;
  }
}

let state: SandboxState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((l) => l());
}

function setState(updater: (s: SandboxState) => SandboxState) {
  state = updater(state);
  persist();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  return state;
}

export function useSandbox(): SandboxState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const uid = (p: string) =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* ─── Consumer ops ─────────────────────────────────────── */
export const sandboxApi = {
  selectConsumer(id: string | null) {
    setState((s) => ({ ...s, selectedConsumerId: id }));
  },
  addConsumer(name: string, reference?: string): SandboxConsumer {
    const c: SandboxConsumer = { id: uid("SBX-C"), name, reference };
    setState((s) => ({ ...s, consumers: [...s.consumers, c], selectedConsumerId: c.id }));
    return c;
  },
  removeConsumer(id: string) {
    setState((s) => ({
      ...s,
      consumers: s.consumers.filter((c) => c.id !== id),
      accounts: s.accounts.filter((a) => a.consumerId !== id),
      transactions: s.transactions.filter((t) => t.consumerId !== id),
      ledger: s.ledger.filter((e) => e.consumerId !== id),
      selectedConsumerId: s.selectedConsumerId === id ? null : s.selectedConsumerId,
    }));
  },

  /* ─── Account ops ─────────────────────────────────────── */
  addAccount(input: Omit<SandboxAccount, "id" | "createdAt" | "status">): SandboxAccount {
    const acc: SandboxAccount = {
      ...input,
      id: uid("SBX-A"),
      createdAt: new Date().toISOString(),
      status: "active",
    };
    setState((s) => ({ ...s, accounts: [...s.accounts, acc] }));
    return acc;
  },
  removeAccount(id: string) {
    setState((s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== id) }));
  },
  generateAccountSet(consumerId: string, currency = "LYD") {
    const defs: Array<[string, SandboxAccountType, NormalSide]> = [
      ["Consumer Cash", "asset", "debit"],
      ["Consumer Wallet", "asset", "debit"],
      ["Main Bank Account", "asset", "debit"],
      ["Accounts Receivable", "asset", "debit"],
      ["Accounts Payable", "liability", "credit"],
      ["Revenue", "revenue", "credit"],
      ["Fee Revenue", "revenue", "credit"],
      ["Processing Fees", "expense", "debit"],
      ["Refunds", "contra", "debit"],
      ["Chargebacks", "expense", "debit"],
      ["Suspense Account", "clearing", "debit"],
      ["Clearing Account", "clearing", "debit"],
      ["Settlement Account", "clearing", "debit"],
      ["Tax Payable", "liability", "credit"],
      ["Customer Deposits", "liability", "credit"],
      ["Owner Equity", "equity", "credit"],
      ["Operating Expense", "expense", "debit"],
      ["Contra Revenue", "contra", "debit"],
      ["Adjustment Account", "clearing", "debit"],
      ["Sandbox Test Account 1", "test", "debit"],
      ["Sandbox Test Account 2", "test", "credit"],
    ];
    const now = new Date().toISOString();
    const newAccts: SandboxAccount[] = defs.map(([name, type, normal]) => ({
      id: uid("SBX-A"),
      consumerId,
      name,
      type,
      normal,
      currency,
      openingBalance: 0,
      status: "active",
      createdAt: now,
    }));
    setState((s) => ({ ...s, accounts: [...s.accounts, ...newAccts] }));
    return newAccts;
  },

  /* ─── Transaction ops ─────────────────────────────────── */
  upsertTransaction(tx: SandboxTransaction) {
    setState((s) => {
      const exists = s.transactions.some((t) => t.id === tx.id);
      return {
        ...s,
        transactions: exists
          ? s.transactions.map((t) => (t.id === tx.id ? tx : t))
          : [...s.transactions, tx],
      };
    });
  },
  voidDraft(txId: string) {
    setState((s) => ({
      ...s,
      transactions: s.transactions.map((t) =>
        t.id === txId && t.status === "draft" ? { ...t, status: "voided" } : t,
      ),
    }));
  },
  postTransaction(txId: string): { ok: boolean; error?: string } {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return { ok: false, error: "Transaction not found" };
    if (tx.status !== "draft" && tx.status !== "validated")
      return { ok: false, error: `Cannot post a ${tx.status} transaction` };
    const v = validateTransaction(tx);
    if (!v.ok) return v;
    const postedAt = new Date().toISOString();
    const entries: SandboxLedgerEntry[] = tx.lines.map((l) => ({
      id: uid("SBX-L"),
      consumerId: tx.consumerId,
      accountId: l.accountId!,
      txId: tx.id,
      txReference: tx.reference || tx.id,
      postedAt,
      debit: l.debit,
      credit: l.credit,
      memo: l.memo,
      status: "posted",
    }));
    setState((s) => ({
      ...s,
      transactions: s.transactions.map((t) =>
        t.id === tx.id ? { ...t, status: "posted", postedAt } : t,
      ),
      ledger: [...s.ledger, ...entries],
    }));
    return { ok: true };
  },
  reverseTransaction(txId: string): { ok: boolean; error?: string; reversalId?: string } {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return { ok: false, error: "Transaction not found" };
    if (tx.status !== "posted") return { ok: false, error: "Only posted transactions can be reversed" };
    const reversal: SandboxTransaction = {
      id: uid("SBX-T"),
      consumerId: tx.consumerId,
      title: `Reversal of ${tx.title}`,
      date: new Date().toISOString().slice(0, 10),
      description: `Reversal of ${tx.reference || tx.id}`,
      reference: `REV-${tx.reference || tx.id}`,
      type: "reversal",
      status: "draft",
      reverseOf: tx.id,
      lines: tx.lines.map((l) => ({
        id: uid("SBX-LN"),
        accountId: l.accountId,
        debit: l.credit,
        credit: l.debit,
        memo: `Reversal: ${l.memo ?? ""}`.trim(),
      })),
      createdAt: new Date().toISOString(),
    };
    setState((s) => ({ ...s, transactions: [...s.transactions, reversal] }));
    const r = sandboxApi.postTransaction(reversal.id);
    if (!r.ok) return { ok: false, error: r.error };
    setState((s) => ({
      ...s,
      transactions: s.transactions.map((t) =>
        t.id === tx.id ? { ...t, status: "reversed", reversedBy: reversal.id } : t,
      ),
    }));
    return { ok: true, reversalId: reversal.id };
  },

  /* ─── Reset / seed ────────────────────────────────────── */
  resetConsumer(consumerId: string) {
    setState((s) => ({
      ...s,
      accounts: s.accounts.filter((a) => a.consumerId !== consumerId),
      transactions: s.transactions.filter((t) => t.consumerId !== consumerId),
      ledger: s.ledger.filter((e) => e.consumerId !== consumerId),
    }));
  },
  resetAll() {
    setState(() => ({ ...EMPTY }));
  },
  seedBalanced(consumerId: string) {
    const accts = state.accounts.filter((a) => a.consumerId === consumerId);
    if (accts.length < 2) return { ok: false, error: "Generate accounts first" };
    const cash = accts.find((a) => a.name === "Consumer Cash") ?? accts[0];
    const rev = accts.find((a) => a.name === "Revenue") ?? accts[1];
    const tx: SandboxTransaction = {
      id: uid("SBX-T"),
      consumerId,
      title: "Sample balanced sale",
      date: new Date().toISOString().slice(0, 10),
      description: "Seeded balanced transaction",
      reference: `SEED-${Date.now().toString(36).toUpperCase()}`,
      type: "general",
      status: "draft",
      lines: [
        { id: uid("L"), accountId: cash.id, debit: 1000, credit: 0, memo: "Cash in" },
        { id: uid("L"), accountId: rev.id, debit: 0, credit: 1000, memo: "Revenue earned" },
      ],
      createdAt: new Date().toISOString(),
    };
    sandboxApi.upsertTransaction(tx);
    sandboxApi.postTransaction(tx.id);
    return { ok: true };
  },
  seedUnbalanced(consumerId: string) {
    const accts = state.accounts.filter((a) => a.consumerId === consumerId);
    if (accts.length < 2) return { ok: false, error: "Generate accounts first" };
    const tx: SandboxTransaction = {
      id: uid("SBX-T"),
      consumerId,
      title: "Sample UNBALANCED transaction",
      date: new Date().toISOString().slice(0, 10),
      description: "Should fail validation",
      reference: `SEED-BAD-${Date.now().toString(36).toUpperCase()}`,
      type: "general",
      status: "draft",
      lines: [
        { id: uid("L"), accountId: accts[0].id, debit: 500, credit: 0 },
        { id: uid("L"), accountId: accts[1].id, debit: 0, credit: 250 },
      ],
      createdAt: new Date().toISOString(),
    };
    sandboxApi.upsertTransaction(tx);
    return { ok: true };
  },
  seedHistory(consumerId: string, n = 5) {
    for (let i = 0; i < n; i++) sandboxApi.seedBalanced(consumerId);
    return { ok: true };
  },
};

/* ─── Selectors ────────────────────────────────────────── */
export function validateTransaction(tx: SandboxTransaction): { ok: boolean; error?: string } {
  if (!tx.lines || tx.lines.length < 2) return { ok: false, error: "At least two lines required" };
  for (const l of tx.lines) {
    if (!l.accountId) return { ok: false, error: "Every line must have an account" };
    if (l.debit < 0 || l.credit < 0) return { ok: false, error: "Amounts must be positive" };
    if (l.debit > 0 && l.credit > 0)
      return { ok: false, error: "A line cannot have both debit and credit" };
    if (l.debit === 0 && l.credit === 0)
      return { ok: false, error: "Each line must have a debit or credit amount" };
  }
  const td = tx.lines.reduce((s, l) => s + l.debit, 0);
  const tc = tx.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(td - tc) > 0.0001) return { ok: false, error: "Debits must equal credits" };
  return { ok: true };
}

export function totals(lines: SandboxTxLine[]) {
  const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  return { debit, credit, diff: debit - credit, balanced: Math.abs(debit - credit) < 0.0001 };
}

export function accountBalance(state: SandboxState, accountId: string): number {
  const acct = state.accounts.find((a) => a.id === accountId);
  if (!acct) return 0;
  const entries = state.ledger.filter((e) => e.accountId === accountId);
  const debit = entries.reduce((s, e) => s + e.debit, 0);
  const credit = entries.reduce((s, e) => s + e.credit, 0);
  const opening = acct.openingBalance ?? 0;
  return acct.normal === "debit" ? opening + debit - credit : opening + credit - debit;
}

export function newDraftTransaction(consumerId: string): SandboxTransaction {
  return {
    id: uid("SBX-T"),
    consumerId,
    title: "",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    reference: "",
    type: "general",
    status: "draft",
    lines: [
      { id: uid("L"), accountId: null, debit: 0, credit: 0 },
      { id: uid("L"), accountId: null, debit: 0, credit: 0 },
    ],
    createdAt: new Date().toISOString(),
  };
}

export function newDraftLine(): SandboxTxLine {
  return { id: uid("L"), accountId: null, debit: 0, credit: 0 };
}