## Plan

1. **Update the active `/login` submit handler only**
   - In `src/routes/login.tsx`, replace the lambda-mode submit branch so the visible login button calls `fetch(`${API_BASE_URL}/auth/login`, ...)` directly.
   - Use the exact manual-browser flow: parse the outer envelope, read `envelope.data`, then store `dahab.access_token`, `dahab.refresh_token`, `dahab.user`, and `dahab.signed_in_at` before any navigation.

2. **Add visible login diagnostics on `/login`**
   - Show these values after pressing Login:
     - `Lambda login called: true/false`
     - `Lambda token returned: true/false`
     - `Lambda token stored: true/false`
     - `DATA_BACKEND value`
   - Keep the existing UI layout; add only a small debug block in the login form.

3. **Prevent Supabase from bypassing Lambda in lambda mode**
   - Ensure the lambda branch returns immediately after success/failure.
   - Do not call `supabase.auth.signInWithPassword` in lambda mode.
   - Do not navigate to `/app` or `/portal` unless `localStorage.getItem("dahab.access_token")` is truthy.

4. **Avoid immediate token clearing after login**
   - In `src/lib/session-timeout.tsx`, adjust the session-timeout effect so lambda mode does not remove `dahab.signed_in_at` when there is no Supabase session.
   - This prevents the auth/session wrapper from partially clearing DAHAB auth state immediately after Lambda login.

5. **Keep data refetch behavior**
   - After token storage is confirmed, dispatch `dahab.auth.changed` and invalidate/refetch `dashboard`, `holders`, `vaults`, `transactions`, `users`, and `notifications`.

## Files to change

- `src/routes/login.tsx`
- `src/lib/session-timeout.tsx`

## Expected result

After using the normal `/login` button, the page visibly reports:

```text
Lambda login called: true
Lambda token returned: true
Lambda token stored: true
DATA_BACKEND value: lambda
```

And the browser console check returns DAHAB keys including `dahab.access_token`, with the token starting with `eyJ`.