// Single source of truth for build-time runtime flags.
// Set these in Workspace Settings → Build Secrets (they need to exist
// at Vite build time, not runtime).
export const DATA_BACKEND = (import.meta.env.VITE_DATA_BACKEND ?? "supabase") as
  | "supabase"
  | "lambda";

export const REALTIME_MODE = (import.meta.env.VITE_REALTIME_MODE ?? "channels") as
  | "channels"
  | "polling"
  | "off";

export const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "") as string;

export const POLL_INTERVAL_MS = 15_000;
