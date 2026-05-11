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
    list: () =>
      apiFetch<Array<{
        test_run_id: string;
        holder_id: string;
        holder_name?: string;
        account_count?: number;
        vault_count?: number;
        created_at?: string;
      }>>("/admin/test-fixtures"),
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
        holder_accounts: Array<{
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
  },
};
