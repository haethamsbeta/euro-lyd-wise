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
