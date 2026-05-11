// Approvals adapter.
import { apiFetch, qs } from "./_shared";
import type { Transaction } from "@/lib/dahabApi";

export const approvalsApi = {
  pending: (params: { limit?: number; offset?: number } = {}) =>
    apiFetch<Transaction[]>(`/approvals/pending${qs(params)}`),
  pendingPaged: (params: { limit?: number; offset?: number } = {}) =>
    apiFetch<any>(`/approvals/pending${qs(params)}`).then((res) => {
      if (Array.isArray(res)) {
        return {
          items: res as Transaction[],
          total: res.length,
          limit: params.limit ?? res.length,
          offset: params.offset ?? 0,
          next_offset: null as number | null,
        };
      }
      return {
        items: (res?.items ?? []) as Transaction[],
        total: typeof res?.total === "number" ? res.total : (res?.items?.length ?? 0),
        limit: res?.limit ?? params.limit ?? 100,
        offset: res?.offset ?? params.offset ?? 0,
        next_offset: (res?.next_offset ?? null) as number | null,
      };
    }),
  approve: (id: string | number, note?: string) =>
    apiFetch<{ ok: true }>(`/approvals/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ note: note ?? null }),
    }),
  reject: (id: string | number, reason: string) =>
    apiFetch<{ ok: true }>(`/approvals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  approveModified: (
    id: string | number,
    approved_amount: number,
    reason: string,
  ) =>
    apiFetch<{ success: true; data: any; message: string }>(
      `/approvals/${id}/approve-modified`,
      {
        method: "POST",
        body: JSON.stringify({ approved_amount, reason }),
      },
    ),
};
