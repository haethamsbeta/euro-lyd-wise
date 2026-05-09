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
  admin: () => apiFetch<AdminDashboard>("/api/dashboard/admin"),
  teller: () => apiFetch<TellerDashboard>("/api/dashboard/teller"),
  auditor: () => apiFetch<AuditorDashboard>("/api/dashboard/auditor"),
};
