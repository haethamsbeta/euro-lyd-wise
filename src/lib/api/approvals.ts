// Approvals adapter.
import { apiFetch, qs } from "./_shared";
import type { Transaction } from "@/lib/dahabApi";

export const approvalsApi = {
  pending: (params: { limit?: number; offset?: number } = {}) =>
    apiFetch<Transaction[]>(`/api/approvals/pending${qs(params)}`),
  approve: (id: string | number, note?: string) =>
    apiFetch<{ ok: true }>(`/api/approvals/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ note: note ?? null }),
    }),
  reject: (id: string | number, reason: string) =>
    apiFetch<{ ok: true }>(`/api/approvals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
