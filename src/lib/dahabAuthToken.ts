// Lambda backend browser-session store. Keep auth material out of localStorage
// so it clears on browser close and is not persisted on shared teller devices.
import { setAuthTokenProvider } from "@/lib/dahabApi";

const KEY = "dahab.access_token";
const REFRESH_KEY = "dahab.refresh_token";
const USER_KEY = "dahab.user";
const SIGNED_IN_AT_KEY = "dahab.signed_in_at";

function sessionStore(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

function legacyLocalStore(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function readSessionValue(key: string): string | null {
  const session = sessionStore();
  const local = legacyLocalStore();
  const value = session?.getItem(key) ?? null;
  if (value) return value;

  // One-time cleanup for users who had tokens saved before this hardening
  // patch. Move the value into sessionStorage, then remove the durable copy.
  const legacy = local?.getItem(key) ?? null;
  if (legacy && session) session.setItem(key, legacy);
  if (legacy) local?.removeItem(key);
  return legacy;
}

function setSessionValue(key: string, value: string | null) {
  const session = sessionStore();
  const local = legacyLocalStore();
  if (!session) return;
  if (value) session.setItem(key, value);
  else session.removeItem(key);
  local?.removeItem(key);
}

export function getAccessToken(): string | null {
  return readSessionValue(KEY);
}

export function setAccessToken(token: string | null) {
  setSessionValue(KEY, token);
}

export function getStoredLambdaUserJson(): string | null {
  return readSessionValue(USER_KEY);
}

export function setStoredLambdaUser(user: unknown) {
  setSessionValue(USER_KEY, JSON.stringify(user ?? {}));
}

export function getSignedInAt(): number | null {
  const raw = readSessionValue(SIGNED_IN_AT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setSignedInAt(value: number | null = Date.now()) {
  setSessionValue(SIGNED_IN_AT_KEY, value == null ? null : String(value));
}

export function setLambdaAuthSession({
  accessToken,
  refreshToken,
  user,
  signedInAt = Date.now(),
}: {
  accessToken: string;
  refreshToken?: string | null;
  user: unknown;
  signedInAt?: number;
}) {
  setSessionValue(KEY, accessToken);
  setSessionValue(REFRESH_KEY, refreshToken || "");
  setStoredLambdaUser(user);
  setSignedInAt(signedInAt);
}

export function clearDahabAuthStorage() {
  for (const storage of [sessionStore(), legacyLocalStore()]) {
    storage?.removeItem(KEY);
    storage?.removeItem(REFRESH_KEY);
    storage?.removeItem(USER_KEY);
    storage?.removeItem(SIGNED_IN_AT_KEY);
  }
}

let installed = false;
export function installLambdaAuthTokenProvider() {
  if (installed) return;
  installed = true;
  setAuthTokenProvider(() => getAccessToken());
}
