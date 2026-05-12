// Admin operations (user provisioning, batch imports, system settings).
import { apiFetch, qs } from "./_shared";

export interface ImportBatch {
  id: string; created_at: string; created_by: string | null;
  filename: string; status: "queued" | "processing" | "review" | "posted" | "failed";
  total_rows: number; valid_rows: number; invalid_rows: number;
}
export interface ImportRow {
  id: string; batch_id: string; row_number: number;
  payload: Record<string, unknown>; errors: string[]; resolved: boolean;
}

export const adminApi = {
  imports: {
    list: (params: { limit?: number } = {}) =>
      apiFetch<ImportBatch[]>(`/admin/imports${qs(params)}`),
    rows: (batch_id: string, params: { only_invalid?: boolean } = {}) =>
      apiFetch<ImportRow[]>(`/admin/imports/${batch_id}/rows${qs(params)}`),
    upload: (formData: FormData) =>
      apiFetch<ImportBatch>("/admin/imports", { method: "POST", body: formData as any }),
    post: (batch_id: string) =>
      apiFetch<{ posted: number }>(`/admin/imports/${batch_id}/post`, { method: "POST" }),
  },
  branches: {
    list: () =>
      apiFetch<Array<{ id: string; name: string; is_active: boolean }>>("/admin/branches"),
    create: (name: string) =>
      apiFetch<{ id: string; name: string; is_active: boolean }>("/admin/branches", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    setActive: (id: string, is_active: boolean) =>
      apiFetch<{ ok: true }>(`/admin/branches/${id}/active`, {
        method: "PUT",
        body: JSON.stringify({ is_active }),
      }),
  },
  testFixtures: {
    list: async () => {
      type Row = {
        test_run_id: string;
        holder_id: string;
        holder_name?: string;
        account_count?: number;
        vault_count?: number;
        created_at?: string;
      };
      const res = await apiFetch<any>("/admin/test-fixtures");
      const items: Row[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res?.data?.items)
            ? res.data.items
            : Array.isArray(res?.data)
              ? res.data
              : [];
      const total: number =
        typeof res?.total === "number"
          ? res.total
          : typeof res?.data?.total === "number"
            ? res.data.total
            : items.length;
      return { items, total };
    },
    create: () =>
      apiFetch<{
        test_run_id: string;
        holder: {
          id: string;
          name: string;
          dahab_account_number?: string;
          is_test?: boolean;
          test_run_id?: string;
          source_system?: string;
        };
        holder_accounts?: Array<{
          id: string;
          currency_code: string;
          account_number?: string;
          is_test?: boolean;
          test_run_id?: string;
          source_system?: string;
        }>;
        accounts?: Array<{
          id: string;
          currency_code: string;
          account_number?: string;
          is_test?: boolean;
          test_run_id?: string;
          source_system?: string;
        }>;
        vaults: Array<{
          id: string;
          currency_code: string;
          name?: string;
          internal_role?: "cash_receivable" | "cash_payable" | string;
          is_test?: boolean;
          test_run_id?: string;
          source_system?: string;
        }>;
      }>("/admin/test-fixtures/e2e", { method: "POST" }),
    cleanup: (testRunId: string) =>
      apiFetch<{ ok: true }>(`/admin/test-fixtures/${encodeURIComponent(testRunId)}`, {
        method: "DELETE",
      }),
    /**
     * Master Admin–only sandbox activity.
     * GET /admin/test-fixtures/:testRunId/activity-basic
     *
     * Do NOT call /activity or /activity-lite — both are deprecated/broken.
     */
    activityBasic: (testRunId: string) =>
      apiFetch<{
        test_run_id: string;
        holder: {
          id: string;
          canonical_name?: string;
          name?: string;
          dahab_account_number?: string;
          is_test?: boolean;
          test_run_id?: string;
          source_system?: string;
        } | null;
        accounts: Array<{
          id: string;
          currency_code: string;
          account_number?: string;
          current_balance?: number | string;
          current_balance_minor?: number | string;
          is_test?: boolean;
          test_run_id?: string;
          source_system?: string;
        }>;
        vaults: Array<{
          id: string;
          currency_code: string;
          name?: string;
          account_number?: string;
          internal_role?: string;
          vault_role?: string;
          source_account_code?: string;
          current_balance?: number | string;
          current_balance_minor?: number | string;
          is_test?: boolean;
          test_run_id?: string;
          source_system?: string;
        }>;
        vault_rules: Array<{
          id?: string;
          currency_code: string;
          direction?: string;
          vault_role?: string;
          vault_account_id?: string;
          source_entry_type_id?: string;
          source_entry_type_name?: string;
          is_active?: boolean;
          is_test?: boolean;
          test_run_id?: string;
        }>;
        balances_by_currency: Array<{
          currency_code: string;
          holder_balance?: number;
          holder_balance_minor?: number | string;
          vault_balance?: number;
          vault_balance_minor?: number | string;
          receivable_balance_minor?: number | string;
          payable_balance_minor?: number | string;
        }>;
        transactions: Array<{
          id?: string;
          tx_number?: string;
          created_at?: string;
          posted_at?: string;
          direction?: string;
          currency_code?: string;
          holder_currency_code?: string;
          vault_currency_code?: string;
          amount_minor?: number | string;
          status?: string;
          comment?: string;
          review_reason?: string;
        }>;
        pending_transactions: Array<{
          id?: string;
          tx_number?: string;
          created_at?: string;
          posted_at?: string;
          direction?: string;
          currency_code?: string;
          holder_currency_code?: string;
          vault_currency_code?: string;
          amount_minor?: number | string;
          status?: string;
          comment?: string;
          review_reason?: string;
        }>;
        totals: {
          holder_account_count?: number;
          vault_account_count?: number;
          account_count?: number;
          transaction_count?: number;
          pending_count?: number;
        };
      }>(`/admin/test-fixtures/${encodeURIComponent(testRunId)}/activity-basic`),
    /**
     * Master Admin–only sandbox transactions list.
     * GET /admin/test-fixtures/:testRunId/transactions
     *
     * Used to render sandbox pending transactions in isolation from the
     * production /approvals page. Render results read-only until backend
     * exposes dedicated sandbox approve/reject endpoints:
     *   POST /admin/test-fixtures/:testRunId/transactions/:txId/approve
     *   POST /admin/test-fixtures/:testRunId/transactions/:txId/reject
     */
    transactions: async (testRunId: string) => {
      type Tx = {
        id?: string;
        tx_number?: string;
        created_at?: string;
        posted_at?: string;
        direction?: string;
        currency_code?: string;
        holder_currency_code?: string;
        vault_currency_code?: string;
        amount_minor?: number | string;
        status?: string;
        comment?: string;
        review_reason?: string;
      };
      const res = await apiFetch<any>(
        `/admin/test-fixtures/${encodeURIComponent(testRunId)}/transactions`,
      );
      const root = res?.data ?? res ?? {};
      const items: Tx[] = Array.isArray(root.items)
        ? root.items
        : Array.isArray(root)
          ? root
          : [];
      const pending_items: Tx[] = Array.isArray(root.pending_items)
        ? root.pending_items
        : items.filter((t) => String(t.status ?? "").toLowerCase() === "pending");
      const posted_items: Tx[] = Array.isArray(root.posted_items)
        ? root.posted_items
        : items.filter((t) => String(t.status ?? "").toLowerCase() === "posted");
      const totals = root.totals ?? {};
      return { items, pending_items, posted_items, totals };
    },
  },
};
