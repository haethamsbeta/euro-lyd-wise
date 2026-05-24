// Single source of truth for build-time runtime flags.
// Prefer Workspace Settings → Build Secrets, but fall back to safe public
// defaults so the app works against the live Lambda API even when build
// secrets are not configured.
//
// SECURITY: Only PUBLIC frontend config goes here. Never put SQL credentials,
// JWT_SECRET, VAPID_PRIVATE_KEY, INTERNAL_WEBHOOK_SECRET, AWS keys, or any
// other server-side secret in this file.
export const DATA_BACKEND = ((import.meta.env.VITE_DATA_BACKEND as string) ||
  "lambda") as "supabase" | "lambda";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://u2j81refrf.execute-api.eu-north-1.amazonaws.com/api";

type RealtimeMode = "channels" | "polling" | "off";
const RAW_REALTIME_MODE = ((import.meta.env.VITE_REALTIME_MODE as string) ||
  "polling") as RealtimeMode;

// In lambda mode we never use Supabase Realtime, regardless of the env value.
export const REALTIME_MODE: RealtimeMode =
  DATA_BACKEND === "lambda"
    ? RAW_REALTIME_MODE === "off"
      ? "off"
      : "polling"
    : RAW_REALTIME_MODE;

export const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string) ||
  "BC5rxQbrj9PUpZKIYmlVBac8k8ak5OZGgabAeg4e3c1LzUj_fAzSQB8fitTbBYzPfaUgIml6isDNI1p4HmZKD0Q";

// Backwards-compat alias (older imports use VAPID_PUBLIC).
export const VAPID_PUBLIC = VAPID_PUBLIC_KEY;

// Per-feature polling intervals (ms). Used as `refetchInterval` on react-query
// hooks and as `setInterval` cadence for non-query subscriptions.
export const POLL_INTERVALS = {
  notifications: 60_000,
  approvals: 60_000,
  pushStatus: 60_000,
  dashboard: 120_000,
  vaultActivity: 120_000,
  transactions: 120_000,
  reports: 300_000,
} as const;

// Backwards-compat alias used by older call sites.
export const POLL_INTERVAL_MS = POLL_INTERVALS.notifications;
