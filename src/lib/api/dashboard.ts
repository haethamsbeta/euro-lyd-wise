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
      return {
        ...res,
        totals,
        pending_approvals: Number(s.pending_approvals ?? 0),
        active_holders: Number(s.active_holders ?? s.holders ?? 0),
        txns_today: Number(s.txns_today ?? 0),
      } as AdminDashboard & Record<string, any>;
    }
    return res as AdminDashboard;
  },
  teller: () => apiFetch<TellerDashboard>("/dashboard/teller"),
  auditor: () => apiFetch<AuditorDashboard>("/dashboard/auditor"),
};