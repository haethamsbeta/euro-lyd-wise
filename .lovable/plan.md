# Make Dahab fast & responsive for a work-day test

The app works, but a few hot spots will cause noticeable lag during a full day of use. None of these changes affect features or design — they only make the experience snappier and reduce wasted network traffic.

## What's slow today

1. **Huge brand images bundled into the JS chunk.**
   `src/assets/dahab-icon.png` (445 KB) and `dahab-logo-full.png` (1.76 MB) are imported via `@/assets/...`, so Vite inlines them into the build. Every page load downloads them.
2. **Heavy libraries loaded on every page.** `jspdf` + `jspdf-autotable` (~250 KB) load on the Transactions page even when no one is exporting. `recharts`, `react-day-picker`, `embla-carousel`, `react-resizable-panels` are bundled by shadcn UI re-exports even though we don't use those components in the live screens.
3. **Data fetching keeps re-running.** `defaultPreloadStaleTime: 0` plus `staleTime: 10s` means switching tabs in the sidebar refires every dashboard/transactions/vault query. Over a work day this is hundreds of unnecessary round-trips.
4. **Auth bootstrap blocks the first paint.** `AuthProvider` waits for the role lookup to finish before letting any route render — every cold load hangs on a Supabase round-trip.
5. **Transactions list pulls 200 rows + joins on every keystroke** (the search query is part of the React Query key, so every letter triggers a new request).
6. **Sidebar logo + nav re-render** on every notification because `NotificationsProvider` lives above the shell and stores the full `items` array in context.

## What we'll change

### 1. Shrink and externalise the logo assets
- Re-encode `dahab-icon.png` to a small PNG (~12 KB) and an additional WebP (~6 KB).
- Move both to `public/brand/dahab-icon.{png,webp}` and reference them by URL (`/brand/dahab-icon.webp`) instead of importing them from `src/assets`. The browser caches them once and they no longer bloat the JS bundle.
- Same treatment for `dahab-logo-full.png` (used only on the landing/login hero) → resize to ~640 px wide, ~80 KB.
- Update `DahabMark`, `DahabCoin`, `DahabLogoFull` to use `<img src="/brand/...">` with `loading="lazy"` and `decoding="async"` (eager only on the login/landing hero).
- Result: ~2.2 MB removed from the initial JS payload.

### 2. Lazy-load the PDF exporter
- Convert `ExportPdfButton` so `jsPDF` and `jspdf-autotable` are loaded with a dynamic `import()` only when the user actually clicks "Download PDF".
- Initial Transactions / Activity page load drops by roughly 250 KB gzipped.

### 3. Trim unused shadcn UI re-exports
- Delete (or stop importing) the unused `chart.tsx`, `calendar.tsx`, `carousel.tsx`, `resizable.tsx` shadcn wrappers. They drag in `recharts`, `react-day-picker`, `embla-carousel`, and `react-resizable-panels` even though no live screen uses them. Verified via `rg` — no app code imports them.
- Saves another ~300 KB gzipped from the shared chunk.

### 4. Tune React Query for a work-day session
In `src/routes/__root.tsx`:
- Raise `staleTime` to 30 s for general queries and 60 s for slow/expensive ones (dashboard, vaults, audit, users).
- Set `gcTime` to 5 min so jumping back to a screen feels instant.
- Keep `refetchOnWindowFocus: false`, add `refetchOnReconnect: "always"` so a brief Wi-Fi blip auto-refreshes.
- In `src/router.tsx`, change `defaultPreloadStaleTime` from `0` to `30_000` and add `defaultPreload: "intent"` so hovering a sidebar link warms the next route.

### 5. Debounce the Transactions search
- Add a 250 ms debounced `searchTerm` and use that (instead of raw `q`) inside the React Query `queryKey`. Typing "1234" now triggers 1 request instead of 4.
- Same pattern for the Accounts search.

### 6. Don't block the UI on the role lookup
- In `src/lib/auth.tsx`, set `loading=false` as soon as `getSession()` resolves and load roles in the background. Routes that genuinely need a role (AppShell, Portal) already gate on `roles.length` separately, so first paint of the landing/login pages becomes immediate.

### 7. Stabilise the notification context
- Memoise the context value with `useMemo` keyed on `items` (already partially done) and split `unread` derivation into a separate selector hook so the sidebar/topbar don't re-render every time an unrelated notification arrives.
- Limit realtime subscription payload to the bell consumer; the `NotificationsProvider` stays where it is but only re-renders subscribers that read `items` vs `unread`.

### 8. Optional polish
- Add `<link rel="preload" as="image" href="/brand/dahab-icon.webp">` in the root `head()` so the brand mark paints with the first frame.
- Add `?display=swap` is already present on the Google Fonts URL — keep it.
- Compress the OG image (currently a remote 1.5 MB JPEG referenced at `og:image`) by swapping to a 1200×630 ~120 KB asset under `public/og/`.

## Files touched

```text
src/components/brand/dahab-mark.tsx        # use /brand/* URLs, drop @/assets imports
src/assets/dahab-icon.png                   # delete
src/assets/dahab-logo-full.png              # delete
public/brand/dahab-icon.png|webp            # add (small)
public/brand/dahab-logo-full.png|webp       # add (small)
src/components/app/export-pdf.tsx           # dynamic import jspdf + autotable
src/components/ui/chart.tsx                 # delete (unused)
src/components/ui/calendar.tsx              # delete (unused)
src/components/ui/carousel.tsx              # delete (unused)
src/components/ui/resizable.tsx             # delete (unused)
package.json                                # drop recharts, react-day-picker,
                                            #   embla-carousel-react,
                                            #   react-resizable-panels
src/routes/__root.tsx                       # QueryClient defaults + preload <link>
src/router.tsx                              # defaultPreload + staleTime
src/lib/auth.tsx                            # non-blocking role load
src/lib/notifications.tsx                   # split unread selector, memo guards
src/routes/app.transactions.index.tsx       # debounce search input
src/routes/app.accounts.index.tsx           # debounce search input
```

## Expected outcome (rough numbers)

| Metric | Before | After |
| --- | --- | --- |
| Initial JS payload (gzipped) | ~1.4 MB | ~0.6 MB |
| Brand image bytes | ~2.2 MB | ~25 KB |
| Time to first interactive (cable) | ~3.0 s | ~0.9 s |
| Sidebar nav switch (warm cache) | re-fetches | instant from cache |
| Transactions search request count per word | one per keystroke | one per pause |

## Out of scope

- No design / copy changes.
- No database schema or RLS changes.
- No new features.

After approval I'll implement these in two passes: (1) bundle/asset shrink + lazy PDF, (2) React Query / auth / search tuning, then verify with the browser performance profiler.
