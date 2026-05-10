// Holder groups adapter.
import { apiFetch, qs } from "./_shared";

export interface HolderGroup {
  id: string; name: string; description: string | null;
  member_count: number; created_at: string;
}

export const groupsApi = {
  list: (params: { q?: string } = {}) =>
    apiFetch<HolderGroup[]>(`/groups${qs(params)}`),
  get: (id: string) => apiFetch<HolderGroup>(`/groups/${id}`),
  members: (id: string) =>
    apiFetch<Array<{ holder_id: string; holder_name: string; added_at: string }>>(
      `/api/groups/${id}/members`,
    ),
  addMember: (id: string, holder_id: string) =>
    apiFetch<{ ok: true }>(`/groups/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ holder_id }),
    }),
  removeMember: (id: string, holder_id: string) =>
    apiFetch<{ ok: true }>(`/groups/${id}/members/${holder_id}`, { method: "DELETE" }),
  create: (body: { name: string; description?: string }) =>
    apiFetch<HolderGroup>("/groups", { method: "POST", body: JSON.stringify(body) }),
};
