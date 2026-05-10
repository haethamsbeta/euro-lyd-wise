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
    apiFetch<AppNotification[]>(`/notifications${qs(params)}`),
  markRead: (id: string) =>
    apiFetch<{ ok: true }>(`/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () =>
    apiFetch<{ ok: true }>("/notifications/read-all", { method: "POST" }),
  prefs: () => apiFetch<NotificationPrefs>("/notifications/prefs"),
  updatePrefs: (body: Partial<NotificationPrefs>) =>
    apiFetch<NotificationPrefs>("/notifications/prefs", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
