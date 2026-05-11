// Holder-account adapter (single account view + ledger).
import { apiFetch, apiFetchEnvelope, qs } from "./_shared";
import type { HolderAccount, LedgerEntry, PagedResult } from "@/lib/dahabApi";

export const accountsApi = {
  list: (
    params: {
      limit?: number;
      offset?: number;
      q?: string;
      currency?: string;
      status?: string;
    } = {},
  ) =>
    apiFetch<PagedResult<HolderAccount> | HolderAccount[]>(`/holder-accounts${qs(params)}`).then(
      (res) => {
        if (Array.isArray(res)) {
          return {
            items: res,
            total: res.length,
            limit: params.limit ?? res.length,
            offset: params.offset ?? 0,
            next_offset: null as number | null,
          };
        }
        return {
          items: res?.items ?? [],
          total: (res as any)?.total ?? 0,
          limit: (res as any)?.limit ?? params.limit ?? 0,
          offset: (res as any)?.offset ?? params.offset ?? 0,
          next_offset: (res as any)?.next_offset ?? null,
        };
      },
    ),
  get: (id: string | number) => apiFetch<HolderAccount>(`/holder-accounts/${id}`),
  ledger: (
    id: string | number,
    range: { from?: string; to?: string; limit?: number; offset?: number } = {},
  ) => apiFetch<LedgerEntry[]>(`/holder-accounts/${id}/ledger${qs(range)}`),
  setWithdrawLimit: (
    id: string | number,
    body: {
      withdraw_limit_enabled: boolean;
      withdraw_limit_amount: number | null;
      withdraw_limit_note?: string;
    },
  ) =>
    apiFetchEnvelope<HolderAccount>(`/holder-accounts/${id}/withdraw-limit`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  statementPdfUrl: (id: string | number, range: { from?: string; to?: string } = {}) =>
    apiFetch<{ url: string; expires_at: string }>(
      `/holder-accounts/${id}/statement.pdf${qs(range)}`,
    ),
};
