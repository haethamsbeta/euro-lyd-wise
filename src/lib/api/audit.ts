// Audit log adapter.
import { apiFetch, qs } from "./_shared";

export interface AuditEntry {
  id: string; ts: string; user_id: string | null; user_email: string | null;
  action: string; entity: string; entity_id: string | null; meta: Record<string, unknown>;
}

export const auditApi = {
  list: (params: {
    q?: string; from?: string; to?: string;
    entity?: string; user_id?: string;
    limit?: number; offset?: number;
  } = {}) => apiFetch<AuditEntry[]>(`/audit${qs(params)}`),
};
