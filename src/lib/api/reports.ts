// Reports adapter — every figure on /app/reports MUST come from here.
// Frontend never multiplies FX, never sums currencies, never invents counts.
import { apiFetch, qs } from "./_shared";
import type { Currency } from "./_shared";

/** Strict allow-list for currency rendering across the Reports page. */
export const ACCEPTED_CCY = ["LYD", "USD", "EUR", "GBP"] as const;
export type AcceptedCurrency = (typeof ACCEPTED_CCY)[number];
/** Returns the canonical currency code when accepted; otherwise a sentinel
 *  "Currency missing" label. UI must use `valid:false` to skip currency-
 *  specific formatting (no fallback to USD, no "UNK"). */
export function displayCurrency(code: string | null | undefined): {
  code: string;
  valid: boolean;
} {
  if (typeof code === "string" && (ACCEPTED_CCY as readonly string[]).includes(code)) {
    return { code, valid: true };
  }
  return { code: "Currency missing", valid: false };
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null =>
  v == null || v === "" ? null : Number(v);

export interface BusinessOverviewResponse {
  counts: {
    total: number | null;
    posted: number | null;
    rejected: number | null;
    pending: number | null;
    rejection_rate: number | null;
  } | null;
  volume_by_currency_30d:
    | Array<{ currency: string; volume_minor: number; posted_count: number | null }>
    | null;
  daily_volume_7d:
    | Array<{ day: string; currency: string; volume_minor: number; tx_count: number | null }>
    | null;
  currency_distribution:
    | Array<{ currency: string; balance_minor: number }>
    | null;
  customer_growth_7m: Array<{ month: string; new_holders: number }> | null;
  top_accounts:
    | Array<{ account_id: string; name: string; currency: string; balance_minor: number }>
    | null;
}

export interface LiquidityHealthRow {
  vault_account_id: string | null;
  vault_name: string | null;
  currency_code: string | null;
  balance_minor: number;
  target_minor: number | null;
  min_minor: number | null;
  minimum_threshold_breach: boolean | null;
  days_of_cover: number | null;
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
export type Gauge = { target_pct: number; current_pct: number } | null;
export interface ComplianceOverview {
  flagged_txns: number; pending_reviews: number;
  resolved_today: number; high_risk_holders: number;
  typology: Array<{ name: string; value: number }>;
  alert_volume: Array<{ d: string; generated: number; resolved: number }>;
  kyc: Gauge;
  aml: Gauge;
  doc_verification: Gauge;
  sanctions: Gauge;
}

const range = (params: { from?: string; to?: string } = {}) => qs(params);

function normalizeGauge(g: any): Gauge {
  if (!g) return null;
  const c = g.current_pct;
  const t = g.target_pct;
  if (c == null || t == null) return null;
  return { current_pct: Number(c), target_pct: Number(t) };
}

export const reportsApi = {
  businessOverview: async (): Promise<BusinessOverviewResponse> => {
    const res = await apiFetch<any>("/reports/business/overview");
    const r = res ?? {};
    const mapCcyRow = (row: any) => ({
      ...row,
      currency: row.currency ?? row.currency_code,
    });
    return {
      counts: r.counts
        ? {
            total: numOrNull(r.counts.total),
            posted: numOrNull(r.counts.posted),
            rejected: numOrNull(r.counts.rejected),
            pending: numOrNull(r.counts.pending),
            rejection_rate: numOrNull(r.counts.rejection_rate),
          }
        : null,
      volume_by_currency_30d: Array.isArray(r.volume_by_currency_30d)
        ? r.volume_by_currency_30d.map((row: any) => ({
            currency: row.currency ?? row.currency_code,
            volume_minor: num(row.volume_minor),
            posted_count: numOrNull(row.posted_count),
          }))
        : null,
      daily_volume_7d: Array.isArray(r.daily_volume_7d)
        ? r.daily_volume_7d.map((row: any) => ({
            day: String(row.day),
            currency: row.currency ?? row.currency_code,
            volume_minor: num(row.volume_minor),
            tx_count: numOrNull(row.tx_count),
          }))
        : null,
      currency_distribution: Array.isArray(r.currency_distribution)
        ? r.currency_distribution.map((row: any) => ({
            currency: row.currency ?? row.currency_code,
            balance_minor: num(row.balance_minor),
          }))
        : null,
      customer_growth_7m: Array.isArray(r.customer_growth_7m)
        ? r.customer_growth_7m.map((row: any) => ({
            month: String(row.month),
            new_holders: num(row.new_holders),
          }))
        : null,
      top_accounts: Array.isArray(r.top_accounts)
        ? r.top_accounts.map(mapCcyRow).map((row: any) => ({
            account_id: String(row.account_id ?? ""),
            name: row.name ?? "—",
            currency: row.currency,
            balance_minor: num(row.balance_minor),
          }))
        : null,
    };
  },
  liquidityHealth: async (): Promise<LiquidityHealthResponse> => {
    const res = await apiFetch<any>("/reports/liquidity-health");
    const rowsIn: any[] = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
    const rows: LiquidityHealthRow[] = rowsIn.map((r) => ({
      vault_account_id: r.vault_account_id ?? null,
      vault_name: r.vault_name ?? null,
      currency_code: r.currency_code ?? r.currency ?? null,
      balance_minor: num(r.balance_minor),
      target_minor: numOrNull(r.target_minor),
      min_minor: numOrNull(r.min_minor),
      minimum_threshold_breach:
        r.minimum_threshold_breach == null ? null : Boolean(r.minimum_threshold_breach),
      days_of_cover: numOrNull(r.days_of_cover),
    }));
    return {
      rows,
      network_total_lyd_minor:
        res && typeof res === "object" ? numOrNull((res as any).network_total_lyd_minor) : null,
      missing_rates:
        res && Array.isArray((res as any).missing_rates) ? (res as any).missing_rates : [],
      generated_at: (res && (res as any).generated_at) ?? "",
    };
  },
  hourlyTraffic: (p?: { from?: string; to?: string }) =>
    apiFetch<HourlyTrafficPoint[]>(`/reports/hourly-traffic${range(p)}`),
  cashFlow: (p?: { from?: string; to?: string }) =>
    apiFetch<CashFlowRow[] | { items: CashFlowRow[] }>(
      `/reports/cash-flow${range(p)}`,
    ).then((res) => (Array.isArray(res) ? res : (res?.items ?? []))),
  tellersToday: async (): Promise<TellerLeaderRow[]> => {
    const res = await apiFetch<any>("/reports/tellers/today");
    const items: any[] = Array.isArray(res)
      ? res
      : Array.isArray(res?.items)
        ? res.items
        : [];
    return items.map((t) => ({
      id: String(t.id ?? ""),
      name: t.name ?? "—",
      branch: t.branch ?? null,
      avatar: t.avatar ?? "",
      txns_today: num(t.txns_today),
      volume_today_minor: num(t.volume_today_minor),
      avg_value_minor: num(t.avg_value_minor),
      accuracy_pct: num(t.accuracy_pct),
      avg_time_seconds: num(t.avg_time_seconds),
      rank: num(t.rank),
      trend: Array.isArray(t.trend) ? t.trend.map(num) : [],
      streak_days: num(t.streak_days),
    }));
  },
  processingTimeDistribution: (p?: { from?: string; to?: string }) =>
    apiFetch<ProcessingTimeBucket[]>(`/reports/processing-time-distribution${range(p)}`),
  rejectionRateTrend: (p?: { from?: string; to?: string }) =>
    apiFetch<RejectionRatePoint[]>(`/reports/rejection-rate-trend${range(p)}`),
  complianceOverview: async (): Promise<ComplianceOverview> => {
    const r = (await apiFetch<any>("/reports/compliance/overview")) ?? {};
    return {
      flagged_txns: num(r.flagged_txns),
      pending_reviews: num(r.pending_reviews),
      resolved_today: num(r.resolved_today),
      high_risk_holders: num(r.high_risk_holders),
      typology: Array.isArray(r.typology)
        ? r.typology
        : Array.isArray(r.risk_typology)
          ? r.risk_typology
          : [],
      alert_volume: Array.isArray(r.alert_volume)
        ? r.alert_volume
        : Array.isArray(r.alert_volume_daily)
          ? r.alert_volume_daily.map((row: any) => ({
              d: String(row.d ?? row.day ?? ""),
              generated: num(row.generated),
              resolved: num(row.resolved),
            }))
          : [],
      kyc: normalizeGauge(r.kyc),
      aml: normalizeGauge(r.aml),
      doc_verification: normalizeGauge(r.document_verification ?? r.doc_verification),
      sanctions: normalizeGauge(r.sanctions),
    };
  },
};
