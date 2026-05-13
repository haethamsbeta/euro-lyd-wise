## Speed optimization plan

### Honest baseline first

The numbers I just measured (FCP 3.4s, TTFB 1.25s) come from the **preview dev server**, which serves unminified CSS, runs cold SSR per request, and adds dev-only overhead like `lovable.js` and `@tanstack-start/styles.css`. In production (`dahablibya.com`) those drop dramatically without any code change.

So the goal here is **only the bottlenecks that survive production**: font payload, render-blocking CSS, LCP preload priority, framer-motion on the landing page, and HTTP cache headers for static assets.

I will **not** rewrite the design, change `src/styles.css` semantics, change routing, or touch the app shell.

---

### 1. Trim Google Fonts payload

`__root.tsx` requests Inter (4 weights), Space Grotesk (2), IBM Plex Sans Arabic (3) = 9 font files on every page. The landing/login realistically use 2–3 weights. Reduce to:
- Inter: 400, 600
- Space Grotesk: 700
- IBM Plex Sans Arabic: 400, 700

Estimated saving: ~120 KB across the woff2 fetches, fewer connections, faster paint.

### 2. LCP image: add `fetchpriority="high"`

`__root.tsx` already preloads `/brand/dahab-icon.webp`. Add `fetchpriority: "high"` so the browser races it ahead of the font CSS.

### 3. Defer framer-motion on landing

`src/routes/index.tsx` imports `framer-motion` at module top, which adds ~35 KB gzip to the landing chunk for what is mostly a fade/slide-in stagger. Replace the `motion.div` wrappers with a tiny CSS keyframe utility (`@keyframes fade-up` already-style fade-in delay). Keep framer-motion everywhere else it's already used in the app.

Estimated saving: smaller landing chunk, faster TTI on the first page users see.

### 4. Cache headers for static brand & icon assets

Add `public/_headers` (TanStack Start static assets are served as-is) so `/brand/*`, `/icon-*.png`, `/favicon.*`, and `/apple-touch-icon.png` get `Cache-Control: public, max-age=31536000, immutable`. Eliminates the 859 ms re-fetch of `dahab-icon.webp` on warm visits.

### 5. Drop oversized PNG fallback if unused

`public/brand/dahab-logo-full.png` is 167 KB. The component uses the `.webp` (40 KB) inside a `<picture>` with PNG fallback. I will keep the PNG fallback (some old browsers need it) but verify nothing else preloads or links the PNG directly. No-op if it's already only used as fallback.

### 6. Don't touch the rest

I am explicitly **not** doing these because the data does not support them:
- Splitting `src/styles.css` — Tailwind v4 already tree-shakes utilities; the @layer component blocks are used app-wide. Risk > reward.
- Rewriting routes for code-splitting — TanStack Start auto-splits route components by default (see `<tanstack-code-splitting>`). It's already optimal.
- Adding image transformer / sharp — overkill for the few brand assets we have.
- Upgrading Lovable Cloud compute — TTFB issue is dev-server cold start, not DB load.

---

### Files I'll change

- `src/routes/__root.tsx` — slimmer Google Fonts URL, add `fetchpriority: "high"` to icon preload.
- `src/routes/index.tsx` — replace `motion.div` with CSS-animated `<div>`s, drop `framer-motion` import.
- `public/_headers` (new) — long-cache rule for `/brand/*`, icons, favicons.

### How I'll verify

After publishing, re-run `browser--performance_profile` against the published URL (`https://dahablibya.com/`), not the preview, and compare FCP, TTFB, and largest-resource size. Numbers from the preview are not a valid benchmark.