// Vaults / internal-accounts adapter.
import { apiFetch, qs } from "./_shared";
import type { InternalAccount, Currency, PagedResult } from "@/lib/dahabApi";

function unwrap<T>(res: PagedResult<T> | T[] | null | undefined): T[] {
  if (Array.isArray(res)) return res;
  return res?.items ?? [];
}

export interface VaultActivityRow {
  id: string;
  posted_at: string;
  tx_number: string;
  description: string | null;
  debit_minor: number;
  credit_minor: number;
  balance_after_minor: number;
}
export interface FxRate {
  id: string | number;
  currency_code: Currency;
  usd_rate: number;
  as_of_date: string; // YYYY-MM-DD
  note: string | null;
  created_at?: string | null;
  created_by?: string | null;
}
export interface VaultTarget {
  vault_id: string; currency: Currency;
  target_minor: number; updated_at: string;
}

export const vaultsApi = {
  list: async () => {
    const res = await apiFetch<PagedResult<InternalAccount> | InternalAccount[]>("/vaults");
    const rows = unwrap(res);
    return rows;
  },
  get: (id: string | number) => apiFetch<InternalAccount>(`/vaults/${id}`),
  recentActivity: (id: string | number, params: { limit?: number; offset?: number } = {}) =>
    apiFetch<any>(`/vaults/${id}/activity${qs(params)}`).then((res) => {
      if (Array.isArray(res)) {
        return { items: res as VaultActivityRow[], total: res.length, limit: params.limit ?? res.length, offset: params.offset ?? 0, next_offset: null as number | null };
      }
      return {
        items: (res?.items ?? []) as VaultActivityRow[],
        total: typeof res?.total === "number" ? res.total : (res?.items?.length ?? 0),
        limit: res?.limit ?? params.limit ?? 0,
        offset: res?.offset ?? params.offset ?? 0,
        next_offset: (res?.next_offset ?? null) as number | null,
      };
    }),
  consolidatedUsd: () =>
    apiFetch<{
      total_usd_minor: number;
      missing_rates: Array<{ from: Currency; to: Currency }>;
      breakdown: Array<{ currency: Currency; amount_minor: number; usd_minor: number }>;
    }>("/vaults/consolidated-usd", { method: "POST" }),
  branches: () =>
    apiFetch<Array<{ id: string; name: string; is_active: boolean }>>("/admin/branches"),
  targets: () => apiFetch<VaultTarget[]>("/admin/vault-targets"),
  setTarget: (vault_id: string, currency: Currency, target_minor: number) =>
    apiFetch<VaultTarget>("/admin/vault-targets", {
      method: "POST",
      body: JSON.stringify({ vault_id, currency, target_minor }),
    }),
};

export interface FxRateUpsert {
  currency_code: Currency;
  usd_rate: number;
  as_of_date: string;
  note?: string | null;
}

export const fxRatesApi = {
  list: () =>
    apiFetch<any>("/admin/fx-rates").then((res) => {
      if (Array.isArray(res)) return res as FxRate[];
      if (Array.isArray(res?.items)) return res.items as FxRate[];
      return [];
    }),
  create: (body: FxRateUpsert) =>
    apiFetch<FxRate>("/admin/fx-rates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string | number, body: FxRateUpsert) =>
    apiFetch<FxRate>(`/admin/fx-rates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
