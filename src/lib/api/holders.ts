// Holders adapter.
import { apiFetch, qs } from "./_shared";
import type { Holder, HolderAccount } from "@/lib/dahabApi";

export const holdersApi = {
  list: (params: { q?: string; status?: string; limit?: number; offset?: number } = {}) =>
    apiFetch<Holder[]>(`/api/holders${qs(params)}`),
  get: (id: string | number) => apiFetch<Holder>(`/api/holders/${id}`),
  create: (body: Partial<Holder>) =>
    apiFetch<Holder>("/api/holders", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string | number, body: Partial<Holder>) =>
    apiFetch<Holder>(`/api/holders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  accounts: (id: string | number) => apiFetch<HolderAccount[]>(`/api/holders/${id}/accounts`),
  addAccount: (id: string | number, body: Partial<HolderAccount>) =>
    apiFetch<HolderAccount>(`/api/holders/${id}/accounts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  totals: (id: string | number) =>
    apiFetch<Array<{ currency: string; total_minor: number }>>(`/api/holders/${id}/totals`),
};
