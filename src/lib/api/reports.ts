// Reports adapter — every figure on /app/reports MUST come from here.
// Frontend never multiplies FX, never sums currencies, never invents counts.
import { apiFetch, qs } from "./_shared";
import type { Currency } from "./_shared";

export interface LiquidityHealthRow {
  currency: Currency;
  balance_minor: number;
  days_of_cover: number | null;
  health: "Healthy" | "Watch" | "Critical" | string;
}
export interface LiquidityHealthResponse {
  rows: LiquidityHealthRow[];
  /** Backend-computed network total in LYD-equivalent minor units. */
  network_total_lyd_minor: number | null;
  /** Currency pairs missing an FX rate. If non-empty, network_total may be null. */
  missing_rates: Array<{ from: Currency; to: Currency }>;
  generated_at: string;
}

export interface HourlyTrafficPoint { h: string; v: number }
/**
 * Raw cash-flow row as returned by `/reports/cash-flow`. Backend returns one
 * row per (day, currency_code, direction). Frontend MUST pivot — never sum
 * across currencies without an explicit label, and never apply FX in the FE.
 */
export interface CashFlowRow {
  day: string;
  currency_code: string;
  direction: "deposit" | "withdraw" | string;
  transaction_count: number;
  volume_minor: number;
}
export interface TellerLeaderRow {
  id: string; name: string; branch: string | null; avatar: string;
  txns_today: number; volume_today_minor: number; avg_value_minor: number;
  accuracy_pct: number; avg_time_seconds: number; rank: number;
  trend: number[]; streak_days: number;
}
export interface ProcessingTimeBucket { bucket: string; count: number }
export interface RejectionRatePoint { d: string; rate_pct: number }
export interface ComplianceOverview {
  flagged_txns: number; pending_reviews: number;
  resolved_today: number; high_risk_holders: number;
  typology: Array<{ name: string; value: number }>;
  alert_volume: Array<{ d: string; generated: number; resolved: number }>;
  kyc: { target_pct: number; current_pct: number };
  aml: { target_pct: number; current_pct: number };
  doc_verification: { target_pct: number; current_pct: number };
  sanctions: { target_pct: number; current_pct: number };
}

const range = (params: { from?: string; to?: string } = {}) => qs(params);

export const reportsApi = {
  liquidityHealth: () => apiFetch<LiquidityHealthResponse>("/reports/liquidity-health"),
  hourlyTraffic: (p?: { from?: string; to?: string }) =>
    apiFetch<HourlyTrafficPoint[]>(`/reports/hourly-traffic${range(p)}`),
  cashFlow: (p?: { from?: string; to?: string }) =>
    apiFetch<CashFlowRow[] | { items: CashFlowRow[] }>(
      `/reports/cash-flow${range(p)}`,
    ).then((res) => (Array.isArray(res) ? res : (res?.items ?? []))),
  tellersToday: () => apiFetch<TellerLeaderRow[]>("/reports/tellers/today"),
  processingTimeDistribution: (p?: { from?: string; to?: string }) =>
    apiFetch<ProcessingTimeBucket[]>(`/reports/processing-time-distribution${range(p)}`),
  rejectionRateTrend: (p?: { from?: string; to?: string }) =>
    apiFetch<RejectionRatePoint[]>(`/reports/rejection-rate-trend${range(p)}`),
  complianceOverview: () => apiFetch<ComplianceOverview>("/reports/compliance/overview"),
};
