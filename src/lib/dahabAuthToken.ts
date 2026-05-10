// Lambda backend access-token store. Persists in localStorage so the token
// survives reloads. apiFetch reads through setAuthTokenProvider().
import { setAuthTokenProvider } from "@/lib/dahabApi";

const KEY = "dahab.access_token";
const REFRESH_KEY = "dahab.refresh_token";
const USER_KEY = "dahab.user";
const SIGNED_IN_AT_KEY = "dahab.signed_in_at";

export function getAccessToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
}

export function clearDahabAuthStorage() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(SIGNED_IN_AT_KEY);
}

let installed = false;
export function installLambdaAuthTokenProvider() {
  if (installed) return;
  installed = true;
  setAuthTokenProvider(() => getAccessToken());
}
