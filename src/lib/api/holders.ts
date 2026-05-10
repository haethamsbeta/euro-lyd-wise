// Holders adapter.
import { apiFetch, qs } from "./_shared";
import type { Holder, HolderAccount, PagedResult } from "@/lib/dahabApi";

export const holdersApi = {
  list: (params: { q?: string; status?: string; limit?: number; offset?: number } = {}) =>
    apiFetch<PagedResult<Holder> | Holder[]>(`/holders${qs(params)}`).then((res) => {
      const rows = Array.isArray(res) ? res : (res?.items ?? []);
      if (import.meta.env.DEV) console.log("holder rows", rows.length);
      return rows;
    }),
  listPaged: (params: { q?: string; status?: string; limit?: number; offset?: number } = {}) =>
    apiFetch<PagedResult<Holder> | Holder[]>(`/holders${qs(params)}`).then((res) => {
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
        total: (res as any)?.total ?? (res?.items?.length ?? 0),
        limit: (res as any)?.limit ?? params.limit ?? 50,
        offset: (res as any)?.offset ?? params.offset ?? 0,
        next_offset: ((res as any)?.next_offset ?? null) as number | null,
      };
    }),
  get: (id: string | number) => apiFetch<Holder>(`/holders/${id}`),
  create: (body: Partial<Holder>) =>
    apiFetch<Holder>("/holders", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string | number, body: Partial<Holder>) =>
    apiFetch<Holder>(`/holders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  accounts: (id: string | number) => apiFetch<HolderAccount[]>(`/holders/${id}/accounts`),
  addAccount: (id: string | number, body: Partial<HolderAccount>) =>
    apiFetch<HolderAccount>(`/holders/${id}/accounts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  totals: (id: string | number) =>
    apiFetch<Array<{ currency: string; total_minor: number }>>(`/holders/${id}/totals`),
};
