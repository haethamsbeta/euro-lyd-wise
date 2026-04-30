## What you'll get

1. **Theme switcher** in the header (Sand · Dark · System) on every page — picks the user's preference, remembers it across sessions, and follows OS settings if "System" is chosen.
2. **A clear "Sign out" button** with the user's email shown on desktop and mobile top bars (not buried in the sidebar footer), plus a confirmation step so it isn't pressed by accident.
3. **Automatic re-sign-in for security**:
   - **Idle timeout** — after 15 minutes of no activity (no clicks, keypresses, or navigation), a warning dialog appears with a 60-second countdown. Stay → keeps you signed in. No response → automatic sign-out.
   - **Hard session cap** — every signed-in session is force-signed-out after 8 hours regardless of activity, so a forgotten browser tab cannot stay open all day.
   - **Tab-sync** — signing out in one tab signs out every other tab instantly.

All three timeouts are configurable via constants in one file so you can tune them later (e.g. shorter for staff, longer for the consumer portal).

## Where each piece appears

- **Header (desktop top bar + mobile top bar + landing/login/portal headers)**: theme toggle button (sun/moon/monitor icon) next to the existing language toggle, and a redesigned account menu showing your email + a clearly labelled "Sign out" item.
- **Sidebar footer**: keep the existing sign-out as a secondary affordance for muscle memory; show last-active time so you know how long you've been logged in.
- **Whole app**: new dialog `"You'll be signed out in 60 seconds — Stay signed in"` triggered by inactivity.

## Technical details

- **Theme system**:
  - New `ThemeProvider` (`src/lib/theme.tsx`) storing `"sand" | "night" | "system"` in `localStorage`. Listens to `prefers-color-scheme` for "system".
  - Rename today's `.dark` block in `src/styles.css` to `.theme-sand` (the current brand look) and add a new `.theme-night` block: deep charcoal background, ivory text, muted gold accents — semantic tokens only, no component changes needed.
  - Toggle button (`src/components/ui/theme-toggle.tsx`) using shadcn `DropdownMenu` with three options.
  - Mounted in `AppShell` desktop topbar, mobile topbar, `index.tsx` header, `login.tsx`, and `portal.tsx` (next to `LanguageToggle`).
- **Sign-out UX**:
  - New `AccountMenu` component: avatar/initial + email + role chips + "Sign out" with `AlertDialog` confirm. Replaces the bare `LogOut` icon button currently in mobile top bar; sidebar gets the same component below the role chips.
- **Idle / hard-cap auto-logout** (`src/lib/session-timeout.tsx`):
  - Constants: `IDLE_MS = 15 * 60_000`, `WARN_MS = 60_000`, `HARD_CAP_MS = 8 * 60 * 60_000`.
  - Activity listeners (`mousedown`, `keydown`, `scroll`, `touchstart`, `visibilitychange`) reset a debounced idle timer.
  - When idle timer fires, show `IdleWarningDialog` with countdown; on timeout call `supabase.auth.signOut()`.
  - Track `signin_at` in `localStorage` on every `SIGNED_IN` auth event; a separate timer enforces hard cap.
  - Use `BroadcastChannel('dahab-auth')` to broadcast sign-out so all tabs react.
  - Mounted inside `AuthProvider` so it only runs while a session exists.
- **Auth refresh**: keep Supabase's built-in refresh-token rotation (already on); the timeouts above are layered on top, not replacements.

## Files

- New: `src/lib/theme.tsx`, `src/lib/session-timeout.tsx`, `src/components/ui/theme-toggle.tsx`, `src/components/app/account-menu.tsx`, `src/components/app/idle-warning-dialog.tsx`
- Edit: `src/styles.css` (rename `.dark` → `.theme-sand`, add `.theme-night`, keep `.dark` as alias for now), `src/routes/__root.tsx` (wrap providers, drop hardcoded `className="dark"`), `src/components/app/app-shell.tsx` (use AccountMenu + ThemeToggle), `src/routes/index.tsx`, `src/routes/login.tsx`, `src/routes/portal.tsx` (header ThemeToggle), `src/lib/auth.tsx` (broadcast sign-out, expose `signedInAt`), `src/lib/i18n/{en,ar}.ts` (new strings).

## Out of scope

- No backend/RLS changes. No new database tables. No changes to Supabase auth configuration (the existing JWT TTL governs token refresh; the new timers act on top of it client-side).
- No "remember me" toggle yet — we can add that later if you want longer sessions for trusted devices.
