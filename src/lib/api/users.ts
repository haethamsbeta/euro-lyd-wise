// Users / staff admin adapter.
import { apiFetch, apiFetchEnvelope, qs } from "./_shared";

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
  // POST /users — create a DAHAB Family staff member (admin only).
  // Backend must insert an audit_log row.
  create: (body: {
    username: string;
    email: string;
    display_name: string;
    password: string;
    role: Exclude<AppRole, "consumer">;
    status?: "active" | "disabled";
    must_change_password?: boolean;
  }) => apiFetchEnvelope<AppUser>("/users", { method: "POST", body: JSON.stringify(body) }),
  updateRole: (id: string, role: Exclude<AppRole, "consumer">) =>
    apiFetch<AppUser>(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  updateStatus: (id: string, status: "active" | "disabled") =>
    apiFetch<AppUser>(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  resetPassword: (id: string, password?: string, must_change_password = true) =>
    apiFetch<{ ok: true }>(`/users/${id}/password-reset`, {
      method: "PATCH",
      body: JSON.stringify({ ...(password ? { password } : {}), must_change_password }),
    }),
  setRole: (id: string, role: Exclude<AppRole, "consumer">) => usersApi.updateRole(id, role),
  setStatus: (id: string, status: "active" | "disabled") => usersApi.updateStatus(id, status),
  passwordReset: (id: string) => usersApi.resetPassword(id),
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
