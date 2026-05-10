## Goal

Wire `VITE_DATA_BACKEND=lambda`, `VITE_API_BASE_URL`, `VITE_REALTIME_MODE=polling`, and `VITE_VAPID_PUBLIC_KEY` into the frontend so the app can run against the SQL Server / Lambda backend without re-introducing forbidden secrets in the client bundle.

## User action (cannot be done from here)

Add these in **Workspace Settings → Build Secrets** (they must exist at build time):

- `VITE_DATA_BACKEND = lambda`
- `VITE_API_BASE_URL = https://YOUR_API_GATEWAY_URL/api`
- `VITE_REALTIME_MODE = polling`
- `VITE_VAPID_PUBLIC_KEY = <public key>`

Forbidden in the frontend (Lambda env only): `VAPID_PRIVATE_KEY`, `SQLSERVER_SECRET_ID`, SQL user/pass, `INTERNAL_WEBHOOK_SECRET`, `JWT_SECRET`.

## Code changes

### 1. New config module `src/lib/runtimeConfig.ts`

Single source of truth read once at module load:

```ts
export const DATA_BACKEND   = (import.meta.env.VITE_DATA_BACKEND ?? "supabase") as "supabase" | "lambda";
export const REALTIME_MODE  = (import.meta.env.VITE_REALTIME_MODE ?? "channels") as "channels" | "polling" | "off";
export const VAPID_PUBLIC   = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";
export const POLL_INTERVAL_MS = 15_000; // notifications + device list polling
```

### 2. Realtime polling branch

**`src/lib/notifications.tsx`** — inside the `useEffect` that today calls `supabase.channel(...).subscribe()`:

- Branch on `REALTIME_MODE`:
  - `"channels"` → keep existing Supabase channel (preview/dev fallback).
  - `"polling"` → `setInterval(refresh, POLL_INTERVAL_MS)` + `visibilitychange` listener that calls `refresh()` on tab focus; clear interval on cleanup. Toast/browser-notify only for new IDs (diff against previous `items` by id).
  - `"off"` → no subscription, no polling (manual refresh only).

**`src/routes/app.settings.notifications.tsx`** — same branch for the `push-devices` channel: in polling mode replace the channel with `setInterval(refetchDevices, POLL_INTERVAL_MS)`.

No UI changes; behavior parity for new-row toasts is preserved by id-diffing.

### 3. VAPID public key — env-first in lambda mode

**`src/lib/push-client.ts`** in `ensureSubscription()`:

```ts
const vapid = DATA_BACKEND === "lambda"
  ? VAPID_PUBLIC  // env only; never call the server function
  : (VAPID_PUBLIC || await getVapidPublicKey());
```

If `DATA_BACKEND === "lambda"` and `VAPID_PUBLIC` is empty → throw a clear error: `"VITE_VAPID_PUBLIC_KEY not configured"` (so misconfiguration is loud, not silent). The server function `getVapidPublicKey` stays for the supabase mode.

### 4. Audit doc refresh

Append a short "Env cutover" section to `docs/SQLSERVER_READINESS_AUDIT_V2.md` listing the four required build vars and the forbidden list, plus the new realtime-mode matrix (channels / polling / off) and which routes/components honor it.

## Out of scope

- No UI redesign.
- No business-logic changes.
- No changes to `apiFetch` / adapter modules (already in place from prior pass).
- No swap of `authService` backend (still flagged separately by `VITE_AUTH_BACKEND`).
- No SSE/WebSocket implementation — polling is the documented interim until a Lambda realtime endpoint exists.

## Verification

- `rg "supabase\.channel"` → only inside `if (REALTIME_MODE === "channels")` branches.
- With `VITE_REALTIME_MODE=polling` set: notifications list and devices table refresh every 15s; no Realtime websocket opens (check Network tab — no `/realtime/v1/websocket` request).
- With `VITE_DATA_BACKEND=lambda` + `VITE_VAPID_PUBLIC_KEY` set: enabling push subscribes successfully without calling the `getVapidPublicKey` server function.
- With `VITE_DATA_BACKEND=lambda` and key empty: `Enable on this device` shows the explicit misconfig error instead of failing silently.
