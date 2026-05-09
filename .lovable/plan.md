## Goal
Upgrade Dahab from in-browser foreground notifications to **real Web Push** (VAPID + service worker), modeled on your proven reference. Add a **per-device subscription list** on Settings → Notifications and a **per-user push status badge + tester** on the Users page. Keep all existing Dahab notification parameters (events, thresholds, reminders, quiet hours) untouched.

## Architecture (mirrors the reference)

```text
Browser (PWA)              Lovable Cloud (Supabase)        Push service (FCM/APNs/Mozilla)
   │                            │                                  │
   │ permission + subscribe ───►│ push_subscriptions               │
   │                            │   (endpoint, p256dh, auth, …)    │
   │                            │                                  │
  user/admin clicks "Send test" │                                  │
   │                            │ server fn: sendPushToUsers ────► │
   │                            │   - JWK-format VAPID JWT (ES256) │
   │                            │   - AES-128-GCM payload (RFC8291)│
   │                            │   - DELETE row on 404/410        │
   │  SW "push" → showNotification ◄────────────────────────────── │
```

> No Supabase Edge Functions. We use TanStack Start `createServerFn` (project rule). All Web Push crypto runs in the Worker runtime via Web Crypto APIs (no Node-only deps).

## Secrets (you'll add these on the next message — do not paste values in chat)
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (e.g. `mailto:ops@dahablibya.com`)

Frontend uses the public key via existing pattern (we'll expose it through a tiny server fn `getVapidPublicKey()` so we don't need a `VITE_*` rebuild step).

Generation (once, locally or via a one-shot exec): `npx web-push generate-vapid-keys`.

## Database migration

`supabase/migrations/<ts>_web_push_devices.sql`

1. Extend `push_subscriptions` to be a real Web Push subscription store:
   - `endpoint text not null` (unique)
   - `p256dh text not null`
   - `auth text not null`
   - `last_seen_at timestamptz not null default now()`
   - `last_success_at timestamptz`
   - `last_error text`
   - Keep existing: `id, user_id, label, user_agent, granted, created_at`
   - `unique (endpoint)` — same browser re-subscribing updates the row
   - Backfill: existing "permission grant" rows without endpoint stay as legacy/foreground markers; cleaned up by a one-line `update granted=false where endpoint is null`.
2. RLS already covers `push self all`. Add **admin-readonly** policy so `admin_list_push_status` / per-user device drill-down works without service role.
3. Update `public.admin_list_push_status()`:
   - Returns per user: `subscription_count` (granted + endpoint not null), `last_seen_at`, `last_success_at`.
4. New RPC `public.admin_list_push_devices(p_user_id uuid)` — admin-only, returns per-device rows (no raw `auth`/`p256dh` exposed; only `id, label, user_agent, granted, created_at, last_seen_at, last_success_at, last_error`).
5. Keep `notif_self_test()` and `admin_send_test_notification()` — they continue to write the in-app `notifications` row. The new server fn additionally fans out a real push to that user's devices.

## Server functions (new — `src/lib/push.functions.ts`, client-safe path per project rule)

- `subscribeThisDevice({ endpoint, p256dh, auth, label, user_agent })` — middleware: `requireSupabaseAuth`. Upserts on `endpoint`, sets `granted=true`, `last_seen_at=now()`.
- `unsubscribeThisDevice({ endpoint })` — flips `granted=false` (history kept) or deletes if user clicks Remove.
- `revokeDevice({ id })` — same, by id (settings list).
- `pingThisDevice({ endpoint })` — bump `last_seen_at`, called on settings page mount.
- `sendTestPushToSelf()` — calls internal `_sendPushToUser(me, "Test notification", …)`.
- `sendTestPushToUser({ user_id })` — middleware admin-only, calls `_sendPushToUser`.
- `getVapidPublicKey()` — returns `process.env.VAPID_PUBLIC_KEY`.

`src/lib/push.server.ts` (server-only, uses `supabaseAdmin`):
- `_sendPushToUser(userId, payload)`:
  1. Load all `granted=true` subs with non-null endpoint.
  2. For each: build VAPID JWT (ES256, JWK-imported via `crypto.subtle.importKey('jwk', …)` — **the JWK detail from your reference**), encrypt payload AES-128-GCM (RFC 8291), `fetch(endpoint, { headers: { Authorization: 'vapid t=…, k=…', 'Content-Encoding': 'aes128gcm', TTL: '60' }, body })`.
  3. On `404`/`410` → delete row. On other errors → store `last_error`. On `2xx` → set `last_success_at=now()`.
- All crypto via Web Crypto (`crypto.subtle`) — Worker-compatible, no `node-web-push`.

## Service worker

- New `public/sw.js` (plain, no PWA plugin — keeps preview-iframe rules from the PWA knowledge note safe):
  - `push` event → `event.waitUntil(self.registration.showNotification(title, { body, data: { url } }))`
  - `notificationclick` → focus or open `data.url`
- Registered from `src/lib/push-client.ts`:
  - Skip registration if inside an iframe or on `id-preview--*` / `lovableproject.com` host (per PWA knowledge — preview-safe).
  - On real domains: `navigator.serviceWorker.register('/sw.js')`, then `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <vapid public, base64url> })`.

## UI

### `src/routes/app.settings.notifications.tsx`
Replace the single "This browser" pill block with two sub-sections inside the **Browser notifications** card:

1. **Header row** (unchanged behavior): permission state pill, "Enable browser notifications" button. On click:
   - request permission → on grant, register SW → create push subscription → call `subscribeThisDevice`.
   - iOS-not-installed detection: show "Install to Home Screen first" banner, hide toggle (matches your reference).
2. **Your devices** table:
   ```text
   Device                 Browser / OS         Status     Last seen   Last delivery   Actions
   This browser  ●        Chrome on macOS      Granted    just now    1 min ago       [Revoke]
   iPhone 15                Safari on iOS      Granted    2h ago      yesterday       [Revoke]
   Old laptop             Firefox on Windows   Revoked    12d ago     —               [Remove]
   ```
   - Data: `select * from push_subscriptions where user_id = me order by last_seen_at desc`.
   - Current device matched by endpoint stored in `localStorage["dahab.pushEndpoint"]` after subscribe.
   - Realtime channel on `push_subscriptions` filtered by `user_id` so multi-tab stays in sync.
3. **"Send test to me"** button (kept) now triggers BOTH the in-app row AND a real push (so the user sees the system notification with the tab closed too).

### `src/routes/app.users.tsx`
- Push column already exists. Enrich tooltip with `subscription_count` + `last_seen_at` + `last_success_at` from updated `admin_list_push_status()`.
- "Send test" action now invokes the new `sendTestPushToUser` server fn (which writes the in-app notification AND fans out push).
- New "View devices" link per user (admin only) → small dialog calling `admin_list_push_devices(user_id)` so you can see whether a teller actually has any active device before chasing them.

### Diagnostics (small, admin-only)
On the same Settings page, an admin-only **Diagnostics** card showing: SW registered?, permission, VAPID key loaded?, current endpoint, last test result. Mirrors your reference's `PushDiagnosticsPanel` but inline (no extra route).

## i18n
Add to `src/lib/i18n/{en,ar}.ts`: "Your devices", "This browser", "Granted", "Revoked", "Last seen", "Last delivery", "Revoke", "Remove", "View devices", "Install app to home screen first to enable push", "VAPID key not configured".

## Out of scope
- Email channel.
- Mobile native (FCM tokens) — Web Push covers Chrome/Edge/Firefox/Safari (iOS 16.4+ installed PWA).
- Quiet hours enforcement on the server (existing columns remain unused; tracked separately).

## Verification steps
1. Add the three secrets, then `getVapidPublicKey()` returns the public key.
2. Enable on Browser A → row appears, status Granted, endpoint stored locally.
3. Click **Send test to me** with the tab in background → real OS notification fires; `last_success_at` updates.
4. Open Browser B (different machine) → second row appears; A no longer carries the "This browser" chip on B.
5. Revoke A from B → A's toggle flips off after the realtime event; next push to A returns 410 → row auto-deleted.
6. Admin on Users page → Send test on a teller → teller (with tab closed) gets a system notification.
7. `bunx tsc --noEmit` passes.