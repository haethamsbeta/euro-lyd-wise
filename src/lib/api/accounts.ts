// Holder-account adapter (single account view + ledger).
import { apiFetch, qs } from "./_shared";
import type { HolderAccount, LedgerEntry } from "@/lib/dahabApi";

export const accountsApi = {
  get: (id: string | number) => apiFetch<HolderAccount>(`/holder-accounts/${id}`),
  ledger: (
    id: string | number,
    range: { from?: string; to?: string; limit?: number; offset?: number } = {},
  ) => apiFetch<LedgerEntry[]>(`/holder-accounts/${id}/ledger${qs(range)}`),
  setWithdrawLimit: (id: string | number, limit_minor: number) =>
    apiFetch<{ ok: true }>(`/holder-accounts/${id}/withdraw-limit`, {
      method: "POST",
      body: JSON.stringify({ limit_minor }),
    }),
  statementPdfUrl: (id: string | number, range: { from?: string; to?: string } = {}) =>
    apiFetch<{ url: string; expires_at: string }>(
      `/holder-accounts/${id}/statement.pdf${qs(range)}`,
    ),
};
