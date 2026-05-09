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
      apiFetch<ImportBatch[]>(`/api/admin/imports${qs(params)}`),
    rows: (batch_id: string, params: { only_invalid?: boolean } = {}) =>
      apiFetch<ImportRow[]>(`/api/admin/imports/${batch_id}/rows${qs(params)}`),
    upload: (formData: FormData) =>
      apiFetch<ImportBatch>("/api/admin/imports", { method: "POST", body: formData as any }),
    post: (batch_id: string) =>
      apiFetch<{ posted: number }>(`/api/admin/imports/${batch_id}/post`, { method: "POST" }),
  },
  branches: {
    list: () =>
      apiFetch<Array<{ id: string; name: string; is_active: boolean }>>("/api/admin/branches"),
    create: (name: string) =>
      apiFetch<{ id: string; name: string; is_active: boolean }>("/api/admin/branches", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    setActive: (id: string, is_active: boolean) =>
      apiFetch<{ ok: true }>(`/api/admin/branches/${id}/active`, {
        method: "PUT",
        body: JSON.stringify({ is_active }),
      }),
  },
};
