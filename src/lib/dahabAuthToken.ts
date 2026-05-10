// Lambda backend access-token store. Persists in localStorage so the token
// survives reloads. apiFetch reads through setAuthTokenProvider().
import { setAuthTokenProvider } from "@/lib/dahabApi";

const KEY = "dahab.access_token";

export function getAccessToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
}

let installed = false;
export function installLambdaAuthTokenProvider() {
  if (installed) return;
  installed = true;
  setAuthTokenProvider(() => getAccessToken());
}
