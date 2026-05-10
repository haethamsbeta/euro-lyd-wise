// Users / staff admin adapter.
import { apiFetch, qs } from "./_shared";

export type AppRole = "admin" | "teller" | "auditor" | "consumer";
export interface AppUser {
  id: string;
  email: string;
  username?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  status?: string | null;
  role?: AppRole | string | null;
  roles?: AppRole[];
  is_active?: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface UsersListResponse {
  items: AppUser[];
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

export const usersApi = {
  list: (params: { q?: string; role?: AppRole; limit?: number; offset?: number } = {}) =>
    apiFetch<UsersListResponse>(
      `/users${qs({ limit: params.limit ?? 100, offset: params.offset ?? 0, q: params.q, role: params.role })}`,
    ),
  get: (id: string) => apiFetch<AppUser>(`/users/${id}`),
  createConsumer: (body: { email: string; full_name: string; phone?: string }) =>
    apiFetch<AppUser>("/users/consumer", { method: "POST", body: JSON.stringify(body) }),
  setRoles: (id: string, roles: AppRole[]) =>
    apiFetch<AppUser>(`/users/${id}/roles`, {
      method: "PUT",
      body: JSON.stringify({ roles }),
    }),
  setActive: (id: string, is_active: boolean) =>
    apiFetch<AppUser>(`/users/${id}/active`, {
      method: "PUT",
      body: JSON.stringify({ is_active }),
    }),
  forcePasswordReset: (id: string) =>
    apiFetch<{ ok: true }>(`/users/${id}/force-password-reset`, { method: "POST" }),
};
