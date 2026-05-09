import {
  getVapidPublicKey,
  pingThisDevice,
  removeDevice,
  revokeDevice,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from "@/server/push.functions";

export const ENDPOINT_KEY = "dahab.pushEndpoint";

export function isPreviewHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}
export function isInIframe() {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    return true;
  }
}
export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
export function isIOS() {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}
export function isStandalonePWA() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
export function iOSNeedsInstall() {
  return isIOS() && !isStandalonePWA();
}

export function prettyDeviceLabel(ua?: string | null) {
  const u = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  let browser = "Browser";
  if (/Edg\//.test(u)) browser = "Edge";
  else if (/OPR\//.test(u)) browser = "Opera";
  else if (/Chrome\//.test(u) && !/Chromium/.test(u)) browser = "Chrome";
  else if (/Firefox\//.test(u)) browser = "Firefox";
  else if (/Safari\//.test(u)) browser = "Safari";
  let os = "";
  if (/Windows/.test(u)) os = "Windows";
  else if (/Mac OS X/.test(u)) os = "macOS";
  else if (/Android/.test(u)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(u)) os = "iOS";
  else if (/Linux/.test(u)) os = "Linux";
  return os ? `${browser} on ${os}` : browser;
}

function urlBase64ToUint8Array(b64: string) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Register SW, request permission if needed, subscribe, and persist on the server. */
export async function ensureSubscription(): Promise<{ endpoint: string } | null> {
  if (!pushSupported() || isPreviewHost() || isInIframe()) return null;
  if (Notification.permission === "default") {
    const r = await Notification.requestPermission();
    if (r !== "granted") return null;
  } else if (Notification.permission !== "granted") {
    return null;
  }
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const vapid = await getVapidPublicKey();
    if (!vapid) throw new Error("Push not configured (missing VAPID public key).");
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  }
  const json = sub.toJSON();
  const endpoint = json.endpoint!;
  const p256dh = json.keys?.p256dh as string;
  const auth = json.keys?.auth as string;
  await subscribeThisDevice({
    data: {
      endpoint,
      p256dh,
      auth,
      label: prettyDeviceLabel(),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    },
  });
  try { localStorage.setItem(ENDPOINT_KEY, endpoint); } catch {}
  return { endpoint };
}

/** Unsubscribe the current browser. */
export async function unsubscribeBrowser() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch {}
    await unsubscribeThisDevice({ data: { endpoint } });
  }
  try { localStorage.removeItem(ENDPOINT_KEY); } catch {}
}

/** Bump last_seen_at for the current device, if any. */
export async function pingCurrent() {
  try {
    const ep = typeof localStorage !== "undefined" ? localStorage.getItem(ENDPOINT_KEY) : null;
    if (ep) await pingThisDevice({ data: { endpoint: ep } });
  } catch {}
}

export { revokeDevice, removeDevice };