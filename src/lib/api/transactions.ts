// Transactions adapter — list, get, post, correct.
import { apiFetch, qs } from "./_shared";
import type { Transaction, TransactionCategory } from "@/lib/dahabApi";

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

export const transactionsApi = {
  list: (
    params: {
      q?: string; from?: string; to?: string;
      category?: TransactionCategory; status?: string;
      limit?: number; offset?: number;
    } = {},
  ) => apiFetch<Transaction[]>(`/api/transactions${qs(params)}`),
  get: (id: string | number) => apiFetch<Transaction>(`/api/transactions/${id}`),
  myRecent: (limit = 10) =>
    apiFetch<Transaction[]>(`/api/transactions/me/recent${qs({ limit })}`),
  post: (body: PostTransactionInput) =>
    apiFetch<Transaction>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  correct: (id: string | number, reason: string) =>
    apiFetch<Transaction>(`/api/transactions/${id}/correct`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
