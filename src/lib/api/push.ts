// Web push adapter. Mirrors docs/API_CONTRACT.md push section.
// SECURITY: admin endpoints MUST NOT return endpoint, p256dh, auth, or
// VAPID_PRIVATE_KEY. Only metadata (label, ua, last_seen, revoked).
import { apiFetch } from "./_shared";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_agent?: string | null;
}
export interface PushSubscriptionRow {
  id: string;
  label: string | null;
  user_agent: string | null;
  last_seen_at: string | null;
  created_at: string;
  revoked_at: string | null;
}
export interface PushAdminUserDevice {
  id: string;
  label: string | null;
  user_agent: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
}

export const pushApi = {
  vapidPublicKey: () => apiFetch<{ key: string }>("/push/vapid-public-key"),
  subscribe: (sub: PushSubscriptionInput) =>
    apiFetch<PushSubscriptionRow>("/push/subscriptions", {
      method: "POST",
      body: JSON.stringify(sub),
    }),
  unsubscribe: (endpoint: string) =>
    apiFetch<{ ok: true }>("/push/subscriptions/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),
  revoke: (id: string) =>
    apiFetch<{ ok: true }>(`/push/subscriptions/${id}/revoke`, { method: "POST" }),
  delete: (id: string) =>
    apiFetch<{ ok: true }>(`/push/subscriptions/${id}`, { method: "DELETE" }),
  ping: () => apiFetch<{ ok: true }>("/push/subscriptions/ping", { method: "POST" }),
  testSelf: () => apiFetch<{ ok: true }>("/push/test/self", { method: "POST" }),
  testUser: (user_id: string) =>
    apiFetch<{ ok: true }>("/push/test/user", {
      method: "POST",
      body: JSON.stringify({ user_id }),
    }),
  adminStatus: () =>
    apiFetch<{ vapid_configured: boolean; total_subscriptions: number; revoked: number }>(
      "/admin/push/status",
    ),
  adminUserDevices: (user_id: string) =>
    apiFetch<PushAdminUserDevice[]>(`/admin/push/users/${user_id}/devices`),
};
