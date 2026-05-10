// Customer portal adapter — RLS-equivalent scoping is enforced server-side.
import { apiFetch, qs } from "./_shared";
import type { LedgerEntry, HolderAccount } from "@/lib/dahabApi";

export const portalApi = {
  me: () => apiFetch<{ holder_id: string; holder_name: string }>("/portal/me"),
  accounts: () => apiFetch<HolderAccount[]>("/portal/accounts"),
  totals: () =>
    apiFetch<Array<{ currency: string; total_minor: number }>>("/portal/totals"),
  ledger: (
    accountId: string,
    currency: string,
    range: { from?: string; to?: string; limit?: number; offset?: number } = {},
  ) =>
    apiFetch<LedgerEntry[]>(
      `/portal/accounts/${accountId}/${currency}/ledger${qs(range)}`,
    ),
  statement: (accountId: string, currency: string, range: { from?: string; to?: string } = {}) =>
    apiFetch<{ url: string; expires_at: string }>(
      `/portal/accounts/${accountId}/${currency}/statement.pdf${qs(range)}`,
    ),
};
