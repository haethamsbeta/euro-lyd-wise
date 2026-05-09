# Push notifications: end-to-end test, tester, and indicator

## Goals

1. Verify the full notification pipeline works (DB insert → Realtime → in-app toast → browser Notification when tab hidden).
2. Let an admin send a **test push** to any "Dahab family" staff user (admin / teller / auditor) and to themselves.
3. Show a clear **indicator** next to each user telling whether their browser push is enabled, and why if not.
4. Make a self-test button available in the user's own Notification settings.

## What's already in place (verified)

- Table `notifications` + Realtime subscription per user in `src/lib/notifications.tsx` → toasts and `new Notification(...)` (only when `document.visibilityState !== "visible"`).
- `_notify_user(user_id, event, severity, title, body, data, tx)` security-definer RPC respects `notification_preferences.enabled[event]`.
- `notification_preferences` (per-user, RLS = self only): holds `browser_push_enabled`, `daily_summary_*`, thresholds, quiet hours columns (currently unused by `_notify_user`).
- `push_subscriptions` (per-user, self RLS): records per-device permission grants — currently written nowhere from the client.

## Gaps to address

- No way to send a test notification → no quick smoke test.
- Admin can't see whether another user has push enabled (RLS hides their prefs).
- Realtime publication for `notifications` is required; will confirm via migration if missing.
- `push_subscriptions` is never populated by the settings page when permission is granted.

## Plan

### 1. Database (migration)

- New event value `test` on `notification_event` enum (so test notifications don't pollute real categories).
- `admin_send_test_notification(p_user_id uuid, p_channel text default 'browser')` — security definer, admin-only via `has_role`. Inserts a notification using `_notify_user` with event `test`, severity `info`, fixed title/body (i18n keys passed in), bypassing the `enabled` gate for `test`.
- `admin_list_push_status()` — security definer, admin-only. Returns one row per profile: `user_id, full_name, role, browser_push_enabled, last_subscription_at, subscription_count`.
- Update `_notify_user` so event `test` is never gated by `enabled` map.
- Ensure `notifications` is in `supabase_realtime` publication (idempotent `ALTER PUBLICATION ... ADD TABLE`).

### 2. Client — Settings page (`src/routes/app.settings.notifications.tsx`)

- Add **"Send test notification to me"** button. Calls a tiny RPC `notif_self_test()` (or reuses `admin_send_test_notification` for own id without admin check via a separate `notif_self_test` rpc — preferred). Shows toast on success.
- After permission is granted, write a row into `push_subscriptions` (label = browser/UA, granted = true) so the admin indicator reflects reality. Remove/flip the row when user disables `browser_push_enabled`.
- Show current state pill: "Foreground delivery only" vs "Background notifications enabled".

### 3. Client — Users page (`src/routes/app.users.tsx`)

- Fetch `admin_list_push_status()` alongside profiles.
- Per-row badge:
  - green "Push on" if `browser_push_enabled && subscription_count>0`,
  - amber "In-app only" if pref enabled but no granted device,
  - grey "Off" otherwise.
- Per-row **"Send test"** action (Bell icon button) → calls `admin_send_test_notification`. Toasts result; if target is offline, mention "delivered to inbox; will appear when they next open the app".
- Tooltip explains rule: browser system notification only fires when their tab is hidden.

### 4. In-app receive logic (`src/lib/notifications.tsx`)

- For event `test`, force the toast and (if permission granted) the browser `Notification` even when tab is visible — so the sender can confirm delivery without backgrounding the tab. All other events keep current behavior.
- Mark test notifications visually (a small "Test" chip) in the bell list so they're easy to clear.

### 5. End-to-end verification (post-implementation)

Manual checklist run from the dev preview after deploy:

1. Two browsers logged in as admin A and teller B.
2. Admin A opens Users page → sees B's push status.
3. A clicks "Send test" on B → B's tab (visible) shows toast + system notification (because event=test forces it) → bell badge increments → row appears in B's notification list.
4. B hides their tab; A clicks again → system notification fires while tab hidden.
5. B's settings page → "Send test to me" → self toast + system notification.
6. B disables `browser_push_enabled` → A's Users page indicator flips to "In-app only" within one refresh.
7. Confirm `_notify_user` still gates non-test events by `enabled[event]`.

## Files touched

- new `supabase/migrations/<ts>_push_test_and_status.sql`
- `src/routes/app.settings.notifications.tsx` (self-test button, push_subscriptions write)
- `src/routes/app.users.tsx` (status badge + test action)
- `src/lib/notifications.tsx` (force foreground for `test` event, "Test" chip)
- `src/lib/i18n/{en,ar}.ts` (strings)

## Notes / decisions

- This stays within the existing "browser foreground notifications" model — no Web Push / VAPID / service worker (PWA constraints in the editor preview). The "push enabled" indicator therefore tracks: (a) user's browser permission was granted on at least one device, and (b) they kept the toggle on.
- Quiet hours columns exist on `notification_preferences` but `_notify_user` doesn't honor them yet; out of scope for this change unless you want it included — call it out and I'll add it.
