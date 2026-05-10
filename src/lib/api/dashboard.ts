// Dashboard adapter — role-scoped KPI snapshots for /app.
import { apiFetch } from "./_shared";
import type { Currency } from "./_shared";

export interface DashboardCurrencyTotal {
  currency: Currency;
  cash_minor: number;
  bank_minor: number;
}
export interface AdminDashboard {
  totals: DashboardCurrencyTotal[];
  pending_approvals: number;
  active_holders: number;
  txns_today: number;
  /** True DB totals from /dashboard/staff summary. Null when backend has not
   *  exposed the field yet — callers must render "—" rather than fabricating. */
  holder_count: number | null;
  holder_account_count: number | null;
  transaction_count: number | null;
  vault_count: number | null;
  /** Net cash balance per currency (Σ balance_minor of receivable + payable
   *  cash vault accounts grouped by currency). Backend already returns net —
   *  payable rows are negative, do NOT subtract again on the client. */
  cash_by_currency: Array<{ currency: Currency; net_balance_minor: number }>;
  /** Net bank balance per currency. Null when backend cannot yet split
   *  cash vs bank (bank_split_available=false). */
  bank_by_currency: Array<{ currency: Currency; net_balance_minor: number }> | null;
  bank_split_available: boolean;
}
export interface TellerDashboard {
  txns_today: number;
  volume_minor_by_currency: Array<{ currency: Currency; amount_minor: number }>;
  recent_txns: Array<{ id: string; tx_number: string; posted_at: string; description: string | null }>;
}
export interface AuditorDashboard {
  flagged_today: number;
  open_reviews: number;
  resolved_today: number;
}

export const dashboardApi = {
  admin: async () => {
    const res = await apiFetch<any>("/dashboard/staff");
    if (import.meta.env.DEV) console.log("dashboard payload", res);
    // Normalize new contract { summary, vault_balances_by_currency,
    // recent_transactions } into the legacy AdminDashboard shape so
    // existing call sites keep working without a sweeping refactor.
    if (res && (res.summary || res.vault_balances_by_currency)) {
      const s = res.summary ?? {};
      const vb: any[] = res.vault_balances_by_currency ?? [];
      const totals = vb.map((row) => ({
        currency: row.currency,
        cash_minor: Number(row.cash_minor ?? row.cash ?? 0),
        bank_minor: Number(row.bank_minor ?? row.bank ?? 0),
      }));
      const cashByCur = Array.isArray(s.cash_by_currency)
        ? s.cash_by_currency.map((r: any) => ({
            currency: r.currency ?? r.currency_code,
            net_balance_minor: Number(r.net_balance_minor ?? r.balance_minor ?? 0),
          }))
        : [];
      const bankSplit = Boolean(s.bank_split_available);
      const bankByCur = bankSplit && Array.isArray(s.bank_by_currency)
        ? s.bank_by_currency.map((r: any) => ({
            currency: r.currency ?? r.currency_code,
            net_balance_minor: Number(r.net_balance_minor ?? r.balance_minor ?? 0),
          }))
        : null;
      return {
        ...res,
        totals,
        pending_approvals: Number(s.pending_approvals ?? 0),
        active_holders: Number(s.active_holders ?? s.holders ?? 0),
        txns_today: Number(s.txns_today ?? 0),
        holder_count: s.holder_count != null ? Number(s.holder_count) : null,
        holder_account_count:
          s.holder_account_count != null ? Number(s.holder_account_count) : null,
        transaction_count:
          s.transaction_count != null ? Number(s.transaction_count) : null,
        vault_count: s.vault_count != null ? Number(s.vault_count) : null,
        cash_by_currency: cashByCur,
        bank_by_currency: bankByCur,
        bank_split_available: bankSplit,
      } as AdminDashboard & Record<string, any>;
    }
    return res as AdminDashboard;
  },
  teller: () => apiFetch<TellerDashboard>("/dashboard/teller"),
  auditor: () => apiFetch<AuditorDashboard>("/dashboard/auditor"),
};