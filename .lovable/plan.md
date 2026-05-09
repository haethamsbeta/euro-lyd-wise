## Goal

Promote the existing "Send test" push action to its own dedicated column in the Users & Roles table so admins can clearly see and trigger a push test per user, side-by-side with the existing Push status indicator.

## Current state

`src/routes/app.users.tsx` already has:
- A **Push** column showing `Push on` / `In-app only` / `Off` with a tooltip (devices count, last seen, last delivery).
- A **Send test** button (calls `sendTestPushToUser`) buried inside the **Actions** column next to "Reset password".

The end-to-end push pipeline (server fn → VAPID → SW → toast feedback) is already wired and working from the previous turn.

## Changes (UI only, single file)

**File:** `src/routes/app.users.tsx`

1. Add a new table header `Test push` between the existing **Push** column and **Grant role** column.
2. Render a new `<td>` per row containing:
   - The existing `Send test` button (moved out of Actions).
   - A small inline status hint under/next to the button:
     - If `pushOn`: show "Ready — N device(s)" in muted text.
     - If `pushPartial` (toggle on, 0 subscriptions): show "In-app only" in amber muted text.
     - If off: show "Off — in-app only" in muted text.
   - Disable the button + show "No devices" hint when the user has zero subscriptions? **No** — keep it enabled so admins can always fire the in-app test; the toast already differentiates outcomes (sent / in-app only / failed).
3. Remove the `Send test` button from the **Actions** column so it's not duplicated. Actions column keeps only "Reset password" (when applicable).
4. Keep the existing tooltip on the **Push** status column unchanged (it already shows last seen / last delivery details).
5. No i18n keys are introduced beyond reusing existing English labels already in the file ("Send test", "Sending…").

## Out of scope

- No changes to server functions, SW, DB schema, or the Notifications settings page.
- No bulk "Send test to all users" action (can be a follow-up if desired).
- No changes to mobile/responsive table breakpoints beyond the natural new column width (table already has `overflow-x-auto`).

## Verification

- Open `/app/users` as admin → confirm new **Test push** column appears with button + status hint per row.
- Click **Send test** for a user with a subscribed device → system notification fires + toast says "Delivered to N of N".
- Click for a user with push off → toast says "In-app test sent … no push-enabled devices".
- Confirm the **Actions** column no longer shows a duplicate Send test button.
