# Lambda Data-Empty Diagnostic

## Root cause
**Auth token was never present for already-signed-in users.**

The Lambda `access_token` is only obtained inside the login form submit handler
(`src/routes/login.tsx`). Users who already had a Supabase session from before
that code was added — or whose `localStorage` was cleared — have a valid
Supabase session but no `dahab.access_token`. Every `apiFetch` therefore goes
out without `Authorization: Bearer …`, and the Lambda backend returns 401.

Console proof:
```
[apiFetch] GET …/api/dashboard/staff
[apiFetch] 401 …/api/dashboard/staff { success:false, message:"Unauthorized." }
```

Backend itself is healthy: `POST /api/auth/login` returns
`{ success:true, data:{ access_token, refresh_token, user{role:"admin"} } }`.

## Fix applied
`src/lib/auth.tsx` — on initial `getSession()`, if a Supabase session exists
but `getAccessToken()` is null, call `supabase.auth.signOut()` and clear state.
The user is bounced to `/login`; signing in once stores both the Supabase
session AND the Lambda `access_token`, after which every adapter call attaches
the Bearer header and returns real data.

Also: `onAuthStateChange("SIGNED_OUT")` now clears the Lambda token to keep
the two stores in sync.

## Not the cause (verified)
- `apiFetch` URL normalization: `…/api/dashboard/staff` — correct.
- Adapter unwrap: `vaults/holders/transactions` already do `res?.items ?? []`.
- Page render shapes: dashboard reads `data.summary.*`, vaults/holders/
  transactions render the array directly.
- Cache cleanup: `clearFrontendBusinessCacheForLambdaMode` does not touch
  `dahab.access_token`.

## What the user must do once
Sign in again on `/login`. After that, Dashboard / Vaults / Holders /
Transactions populate from the live Lambda backend.
