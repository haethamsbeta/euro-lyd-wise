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
  base: Currency; quote: Currency;
  rate: number; effective_at: string;
  set_by_user_id: string | null;
}
export interface VaultTarget {
  vault_id: string; currency: Currency;
  target_minor: number; updated_at: string;
}

export const vaultsApi = {
  list: async () => {
    const res = await apiFetch<PagedResult<InternalAccount> | InternalAccount[]>("/vaults");
    const rows = unwrap(res);
    if (import.meta.env.DEV) console.log("vault rows", rows.length);
    return rows;
  },
  get: (id: string | number) => apiFetch<InternalAccount>(`/vaults/${id}`),
  recentActivity: (id: string | number, params: { limit?: number } = {}) =>
    apiFetch<VaultActivityRow[]>(`/vaults/${id}/activity${qs(params)}`),
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

export const fxRatesApi = {
  list: () => apiFetch<FxRate[]>("/admin/fx-rates"),
  set: (base: Currency, quote: Currency, rate: number) =>
    apiFetch<FxRate>("/admin/fx-rates", {
      method: "POST",
      body: JSON.stringify({ base, quote, rate }),
    }),
};
