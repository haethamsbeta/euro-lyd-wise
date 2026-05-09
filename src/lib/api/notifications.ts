// In-app notifications adapter.
import { apiFetch, qs } from "./_shared";

export interface AppNotification {
  id: string; user_id: string; type: string; title: string;
  body: string | null; link: string | null; created_at: string; read_at: string | null;
}
export interface NotificationPrefs {
  email_enabled: boolean; push_enabled: boolean;
  reminders_enabled: boolean; types_disabled: string[];
}

export const notificationsApi = {
  list: (params: { unread_only?: boolean; limit?: number; offset?: number } = {}) =>
    apiFetch<AppNotification[]>(`/api/notifications${qs(params)}`),
  markRead: (id: string) =>
    apiFetch<{ ok: true }>(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () =>
    apiFetch<{ ok: true }>("/api/notifications/read-all", { method: "POST" }),
  prefs: () => apiFetch<NotificationPrefs>("/api/notifications/prefs"),
  updatePrefs: (body: Partial<NotificationPrefs>) =>
    apiFetch<NotificationPrefs>("/api/notifications/prefs", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
