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
  accounts: (id: string | number) =>
    apiFetch<HolderAccount[] | { items: HolderAccount[]; next_cursor?: string | null }>(
      `/holders/${encodeURIComponent(String(id))}/accounts`,
    ).then((res) => {
      const items = Array.isArray(res) ? res : (res?.items ?? []);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[holders.accounts]", `/holders/${id}/accounts`, items.length, "items");
      }
      return items;
    }),
  addAccount: (id: string | number, body: Partial<HolderAccount>) =>
    apiFetch<HolderAccount>(`/holders/${id}/accounts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  totals: (id: string | number) =>
    apiFetch<Array<{ currency: string; total_minor: number }>>(`/holders/${id}/totals`),
  transactions: (
    id: string | number,
    params: { limit?: number; offset?: number } = {},
  ) =>
    apiFetch<any>(`/holders/${id}/transactions${qs(params)}`).then((res) => {
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
        total: typeof res?.total === "number" ? res.total : (res?.items?.length ?? 0),
        limit: res?.limit ?? params.limit ?? 50,
        offset: res?.offset ?? params.offset ?? 0,
        next_offset: (res?.next_offset ?? null) as number | null,
      };
    }),
};
