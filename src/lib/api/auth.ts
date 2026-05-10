// Auth adapter — POST /api/auth/* endpoints on the Lambda backend.
// Used by src/lib/authService.lambda.ts. Never stores or retrieves passwords;
// password reset goes through the email link flow only.
import { apiFetch } from "./_shared";

export interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  token?: string;
  user?: { id: string; email?: string; role?: string; [key: string]: unknown };
  data?: {
    access_token?: string;
    refresh_token?: string;
    token?: string;
    user?: { id: string; email?: string; role?: string; [key: string]: unknown };
  };
}
export interface MeResponse {
  userId: string;
  email: string | null;
  fullName: string | null;
  roles: string[];
  mustChangePassword: boolean;
}

export const authApi = {
  login: ({ email, password }: { email: string; password: string }) =>
    apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => apiFetch<MeResponse>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ ok: true }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    apiFetch<{ ok: true }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),
  forgotPassword: (email: string) =>
    apiFetch<{ ok: true }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
};
