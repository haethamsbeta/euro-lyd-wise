// Transactions adapter — list, get, post, correct.
import { apiFetch, qs, normalizeTxRow } from "./_shared";
import type { PagedResult, Transaction, TransactionCategory } from "@/lib/dahabApi";

export interface PostTransactionInput {
  holder_account_id?: string | number | null;
  internal_account_id?: string | number | null;
  transaction_category: TransactionCategory;
  debit_minor?: number;
  credit_minor?: number;
  currency_code: string;
  description?: string | null;
  /** Idempotency key — client-generated UUID; backend dedupes. */
  idempotency_key: string;
}

/**
 * Cash-only transaction payload used by the New Transaction wizard while
 * bank vaults are not yet provisioned. Mirrors the contract documented in
 * docs/API_CONTRACT.md (POST /transactions).
 */
export interface PostCashTransactionInput {
  holder_account_id: string | number;
  direction: "deposit" | "withdraw";
  channel: "cash";
  transaction_category: "cash";
  amount: number;
  currency_code: string;
  vault_account_id: string | number;
  comment: string;
  idempotency_key: string;
}

export const transactionsApi = {
  list: (
    params: {
      q?: string; from?: string; to?: string;
      category?: TransactionCategory; status?: string;
      limit?: number; offset?: number;
    } = {},
  ) =>
    apiFetch<PagedResult<Transaction> | Transaction[]>(
      `/transactions${qs(params)}`,
    ).then((res) => {
      const rows = Array.isArray(res) ? res : (res?.items ?? []);
      return rows.map((r: any) => normalizeTxRow(r)) as typeof rows;
    }),
  /**
   * Paged variant — returns the full backend envelope so callers can use
   * `total` and `next_offset` for pagination.
   */
  listPaged: (
    params: {
      q?: string; from?: string; to?: string;
      category?: TransactionCategory; status?: string;
      limit?: number; offset?: number;
    } = {},
  ) =>
    apiFetch<any>(`/transactions${qs(params)}`).then((res) => {
      if (Array.isArray(res)) {
        const items = res.map((r: any) => normalizeTxRow(r));
        return { items, total: items.length, limit: params.limit ?? items.length, offset: params.offset ?? 0, next_offset: null };
      }
      const items = (res?.items ?? []).map((r: any) => normalizeTxRow(r));
      return {
        items,
        total: typeof res?.total === "number" ? res.total : items.length,
        limit: res?.limit ?? params.limit ?? 0,
        offset: res?.offset ?? params.offset ?? 0,
        next_offset: res?.next_offset ?? null,
      };
    }),
  get: (id: string | number) =>
    apiFetch<Transaction>(`/transactions/${id}`).then((r) => normalizeTxRow(r as any) as Transaction),
  myRecent: (limit = 10) =>
    apiFetch<PagedResult<Transaction> | Transaction[]>(
      `/transactions/me/recent${qs({ limit })}`,
    ).then((res) => {
      const rows = Array.isArray(res) ? res : (res?.items ?? []);
      return rows.map((r: any) => normalizeTxRow(r)) as typeof rows;
    }),
  post: (body: PostTransactionInput) =>
    apiFetch<Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => normalizeTxRow(r as any) as Transaction),
  postCash: (body: PostCashTransactionInput) =>
    apiFetch<Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify({
        ...body,
        amount_minor: body.amount,
        amount: body.amount / 100,
      }),
    }).then((r) => normalizeTxRow(r as any) as Transaction),
  /**
   * Reverse a posted transaction and post a corrected entry. Backend contract:
   * `POST /api/transactions/:id/correct` body
   * `{ new_amount_minor, new_comment, correction_reason }`. Returns the new
   * (corrected) transaction; if the new entry overdrafts the account it is
   * queued for admin approval (status=pending) instead of posting immediately.
   */
  correct: (
    id: string | number,
    body: {
      new_amount_minor: number;
      new_comment: string;
      correction_reason: string;
    },
  ) =>
    apiFetch<Transaction>(`/transactions/${id}/correct`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => normalizeTxRow(r as any) as Transaction),
};
