// Users / staff admin adapter.
import { apiFetch, qs } from "./_shared";

export type AppRole = "admin" | "teller" | "auditor" | "consumer";
export interface AppUser {
  id: string; email: string; full_name: string | null;
  roles: AppRole[]; is_active: boolean;
  must_change_password: boolean; created_at: string;
}

export const usersApi = {
  list: (params: { q?: string; role?: AppRole } = {}) =>
    apiFetch<AppUser[]>(`/api/users${qs(params)}`),
  get: (id: string) => apiFetch<AppUser>(`/api/users/${id}`),
  createConsumer: (body: { email: string; full_name: string; phone?: string }) =>
    apiFetch<AppUser>("/api/users/consumer", { method: "POST", body: JSON.stringify(body) }),
  setRoles: (id: string, roles: AppRole[]) =>
    apiFetch<AppUser>(`/api/users/${id}/roles`, {
      method: "PUT",
      body: JSON.stringify({ roles }),
    }),
  setActive: (id: string, is_active: boolean) =>
    apiFetch<AppUser>(`/api/users/${id}/active`, {
      method: "PUT",
      body: JSON.stringify({ is_active }),
    }),
  forcePasswordReset: (id: string) =>
    apiFetch<{ ok: true }>(`/api/users/${id}/force-password-reset`, { method: "POST" }),
};
