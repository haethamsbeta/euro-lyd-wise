// Lambda-mode startup hygiene: wipe any cached business data left behind by
// a previous Supabase-mode session so the app cannot silently render stale
// holders / accounts / transactions / dashboard / report rows.
//
// PRESERVES: theme, language, sidebar state, push permission, dashboard
// layout prefs (UI-only), service worker registrations.
import { DATA_BACKEND } from "@/lib/runtimeConfig";

const BUSINESS_KEY_PATTERNS: RegExp[] = [
  /^dahab\.(dashboard|reports|transactions|holders|accounts|vaults|users|approvals|notifications)\b/i,
  /^dahab\.(mock|demo|preview|seed|sample)\b/i,
  /^sb-.*-(business|cache)/i,
  /^rq-cache:/i,
];

const PRESERVE_KEY_PATTERNS: RegExp[] = [
  /^dahab\.(theme|lang|sidebar|locale)\b/i,
  /^dahab\.dash\.prefs:/i, // UI-only layout prefs (no business rows)
  /^theme$/i,
  /^vite-ui-theme$/i,
];

function shouldRemove(key: string): boolean {
  if (PRESERVE_KEY_PATTERNS.some((p) => p.test(key))) return false;
  return BUSINESS_KEY_PATTERNS.some((p) => p.test(key));
}

function wipe(storage: Storage) {
  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && shouldRemove(k)) toRemove.push(k);
  }
  for (const k of toRemove) storage.removeItem(k);
  return toRemove.length;
}

let didRun = false;
export function clearFrontendBusinessCacheForLambdaMode() {
  if (typeof window === "undefined") return;
  if (didRun) return;
  didRun = true;
  if (DATA_BACKEND !== "lambda") return;
  try {
    const a = wipe(window.localStorage);
    const b = wipe(window.sessionStorage);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(
        `DAHAB lambda mode: frontend business cache cleared (${a + b} keys)`,
      );
    }
  } catch {
    // storage may be unavailable (private mode); safe to ignore
  }
}