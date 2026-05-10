// Single source of truth for build-time runtime flags.
// Set these in Workspace Settings → Build Secrets (they need to exist
// at Vite build time, not runtime).
export const DATA_BACKEND = (import.meta.env.VITE_DATA_BACKEND ?? "supabase") as
  | "supabase"
  | "lambda";

type RealtimeMode = "channels" | "polling" | "off";
const RAW_REALTIME_MODE = (import.meta.env.VITE_REALTIME_MODE ?? "channels") as RealtimeMode;

// In lambda mode we never use Supabase Realtime, regardless of the env value.
export const REALTIME_MODE: RealtimeMode =
  DATA_BACKEND === "lambda"
    ? RAW_REALTIME_MODE === "off"
      ? "off"
      : "polling"
    : RAW_REALTIME_MODE;

export const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "") as string;

// Per-feature polling intervals (ms). Used as `refetchInterval` on react-query
// hooks and as `setInterval` cadence for non-query subscriptions.
export const POLL_INTERVALS = {
  notifications: 30_000,
  approvals: 30_000,
  pushStatus: 30_000,
  dashboard: 60_000,
  vaultActivity: 60_000,
  reports: 120_000,
} as const;

// Backwards-compat alias used by older call sites.
export const POLL_INTERVAL_MS = POLL_INTERVALS.notifications;
