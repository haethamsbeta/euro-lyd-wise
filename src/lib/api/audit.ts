// Audit log adapter.
import { apiFetch, qs } from "./_shared";

export interface AuditEntry {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_username: string | null;
  actor_role: string | null;
  metadata_json: Record<string, unknown> | null;
  // legacy aliases (optional)
  ts?: string;
  user_id?: string | null;
  user_email?: string | null;
  entity?: string | null;
  meta?: Record<string, unknown> | null;
}

export const auditApi = {
  list: (params: {
    q?: string; from?: string; to?: string;
    entity?: string; user_id?: string;
    limit?: number; offset?: number;
  } = {}) => apiFetch<AuditEntry[]>(`/audit${qs(params)}`),
  listPaged: (params: {
    q?: string; from?: string; to?: string;
    entity?: string; user_id?: string;
    limit?: number; offset?: number;
  } = {}) =>
    apiFetch<any>(`/audit${qs(params)}`).then((res) => {
      if (Array.isArray(res)) {
        return {
          items: res as AuditEntry[],
          total: res.length,
          limit: params.limit ?? res.length,
          offset: params.offset ?? 0,
          next_offset: null as number | null,
        };
      }
      return {
        items: (res?.items ?? []) as AuditEntry[],
        total: typeof res?.total === "number" ? res.total : (res?.items?.length ?? 0),
        limit: res?.limit ?? params.limit ?? 100,
        offset: res?.offset ?? params.offset ?? 0,
        next_offset: (res?.next_offset ?? null) as number | null,
      };
    }),
};
