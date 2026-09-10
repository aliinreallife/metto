# Metto TWA Readiness

Metto (`https://metto.ir`) is a Next.js/React/TypeScript Tehran Metro
route-planning PWA. This document describes its offline/TWA-ready state:
what works offline, what still needs Internet, how the service-worker cache
and holiday dataset behave, how to test manually, and what remains before a
Café Bazaar / Myket Trusted Web Activity (TWA) release.

> Scope rule: no Android/Bubblewrap wrapper has been created in this
> repository, and no fake Digital Asset Links values exist. See
> [Future TWA steps](#future-twa-steps-do-not-perform-yet).

---

## 1. Offline functionality (after one online initialization)

After opening Metto online once (offline caching runs silently in the
background — normal usage shows no preparation text), fully closing the
app, going offline, and reopening it, all of the following work without
Internet:

- Opening `/` (cold start, no warm SPA session required).
- Direct offline loads of `/`, `/stations`, `/nearby`, `/map`.
- Station search (fully local, Persian/English).
- Selecting origin/destination stations.
- Station-to-station route calculation (local Dijkstra engine).
- Transfer information, train-change information, stop count, ETA.
- Timetable/schedule information from the local `schedule-data.json`.
- Station list, station details backed by local data, next departures.
- `/nearby` distance calculations and amenity filtering.
- GPS-based origin/nearby when the **device** can supply coordinates
  (GPS does not need Internet; see [GPS](#6-gpslocation-ux)).
- Persian/English UI selection.
- Local metro map vectors (lines, station markers, route highlight).
- Holiday-aware schedule selection from the local holiday dataset.
- Compact holiday summary inside the timetable UI (today’s schedule rules,
  last update, next/upcoming known holidays).

“Offline ready” is only claimed when **all** of these hold
(tracked silently by `lib/offline/use-offline-readiness.ts`; transitions
are logged as `console.debug("[Metto Offline]", …)` and mirrored to
`window.__mettoOffline` — no user-facing preparation text):

1. A service worker controls the page.
2. The Serwist precache contains the datasets
   (`/schedule-data.json` + `/holidays.json`, verified via Cache Storage —
   never just “worker installed”).
3. The timetable dataset is loaded in memory.
4. The holiday dataset is loaded in memory.

---

## 2. Internet-required functionality

These are online-only by design and fail gracefully (never a crash, never a
hang, never a misleading empty state):

- **Landmark/POI/address/place search (Nominatim).** Station results keep
  working; the Places section shows:
  - FA: «برای جستجوی مکان به اینترنت نیاز است.»
  - EN: “Internet is required to search for places.”
  No Nominatim request is even attempted while `navigator.onLine === false`,
  nothing is retried aggressively, and nothing is precached.
- **Reverse geocoding** (GPS origin labels, e.g. neighborhood names).
  Offline, GPS origins fall back to the generic “Your location” label.
- **CARTO/Esri basemap tiles.** The geographic background needs Internet
  (subject only to the opportunistic recently-viewed CARTO retention in
  §2.1 — never a full offline map).
  Metro lines/station markers/route vectors still render; `/map` shows:
  - FA: «نقشه پایه به اینترنت نیاز دارد؛ خطوط و ایستگاه‌های مترو آفلاین نمایش داده می‌شوند.»
  - EN: “The basemap requires Internet; metro lines and stations are still available offline.”
- Future live service-disruption/closure feeds (not implemented; planned as
  online-only additions — calendar holidays and emergency closures are kept
  strictly separate).

### 2.1 Opportunistic CARTO tile retention (recently viewed only — NOT offline maps)

- CARTO raster tiles the user has **actually viewed** may be retained in a
  small service-worker cache (`metto-carto-tiles`): **≤ 300 entries (LRU),
  ≤ 30 days retention**, browser Cache Storage only, never server-side.
- Policy basis: **CARTO Basemaps Terms and Conditions** (live copy:
  `https://carto.com/legal/basemap-terms`; text verified as last updated
  **26 Aug 2026**), §9.c, which prohibits bulk downloading, server-side
  proxying/caching, and redistribution — while expressly permitting
  *“caching map content on an end user's device or in an end user's browser
  for [up to] thirty (30) days.”* This feature implements exactly that
  allowance: no prefetch, no tile enumeration, no zoom-level crawling, no
  offline-area download, no tile packs. (CARTO’s own CDN sends
  `Cache-Control: public, max-age=15552000`, so a 30-day client cap is
  conservative.)
- Offline behavior: cached tiles may render where previously viewed;
  unviewed areas stay blank; metro vectors/stations still render; the
  offline-basemap banner (§2) still shows. A cache miss fails cleanly
  (handled failure → Leaflet `tileerror`) with no worker `no-response`
  noise and no fabricated placeholder tile.
- Tiles arrive as **opaque** responses (Leaflet `<img>` without CORS mode —
  kept deliberately so map behavior never depends on CORS headers). Only
  validated tiles are stored (HTTP 200 basic/cors or opaque; never
  redirects, `opaqueredirect`, errors, or 3xx/4xx/5xx). Note: Chromium
  quota accounting pads opaque entries (~MBs each for accounting, not real
  bytes — real tiles measured ~15 KB); the 300-entry LRU, 30-day expiry,
  and quota-pressure purge-first rule bound this. Measured during testing
  (see PR); re-measure on low-end devices if quota pressure is suspected.
- **Esri stays network-only** (satellite + labels unmatched, never cached).
- **Not part of offline readiness**: an empty tile cache changes nothing
  about the ready state, which depends only on app shell + metro data +
  schedule + holidays.
- **Provider-removal cleanup rule**: if Metto ever stops using CARTO,
  switches providers, or otherwise ceases using the CARTO basemap service,
  that release MUST explicitly delete the `metto-carto-tiles` cache
  (helper: `purgeCartoTileCache()` in `lib/map/carto-tiles.ts` — e.g. from
  service-worker activation or first app startup), per §9.c’s ban on
  retaining cached content after ceasing use.

---

## 3. Cache lifecycle (Serwist Configurator mode)

- **Source:** `app/sw.ts`. **Build:** `next build && serwist build`
  (config: `serwist.config.js`). Serwist runs **after** prerendering, so it
  deterministically discovers prerendered HTML (`/`, `/stations`, `/nearby`,
  `/map`), hashed `_next/static` chunks, CSS, self-hosted fonts, icons,
  `schedule-data.json`, `holidays.json`, and `/manifest.webmanifest`
  (explicit entry with a source-hash revision). No hand-maintained hashed
  file list exists. Current production precache: 46 URLs (~8.4 MB).
- **Runtime rules** (`app/sw.ts`, conservative by design):
  - `CacheFirst`: immutable same-origin `/_next/static/*`.
  - `NetworkFirst`: same-origin navigations/RSC (8 s timeout) with an
    offline fallback to precached `/`; only `200` basic responses stored
    (errors/redirects can never poison the cache across deploys).
  - `NetworkFirst`: `/holidays.version.json` (tiny update pointer,
    deliberately **not** precached so it revalidates).
  - `NetworkOnly` (never cached): `POST` (no rule matches non-GET),
    `/api/*`, **all** cross-origin (Nominatim, Esri, CARTO, timestamp.ir,
    fonts), version-pinned `/holidays.json?v=…` downloads.
- **Installation:** the worker precaches during `install`; activation
  removes legacy `metto-v*` caches from the old hand-written worker.
- **Updating:** a new worker **never** `skipWaiting()` on its own. When one
  is waiting, the app shows a small “new version available / به‌روزرسانی”
  banner; refresh posts `SKIP_WAITING` and reloads once on
  `controllerchange` (with a timeout safety net). This avoids old-HTML +
  new-chunks breakage mid-route-planning.
- **User-controlled refresh:** the update banner; otherwise clearing site
  data in the browser removes everything (service worker, precache,
  datasets, preferences) and the app re-initializes on next online visit.
- **Registration:** `SerwistProvider` in `app/layout.tsx` (early,
  `updateViaCache: "none"`, disabled in development). The install-PWA
  button (`components/pwa.tsx`) handles only the install prompt.
  `reloadOnOnline` is **off** (a tunnel/elevator network flicker must never
  reload mid-route-planning) and `cacheOnNavigation` is **off** (our worker
  ignores `CACHE_URLS`; precache already covers navigations).

---

## 4. Browser storage

- On startup the app calls `navigator.storage.persist()` once (best effort,
  feature-detected, silent): `lib/offline/storage.ts`.
- `persisted()` / `estimate()` are supported where available; nothing
  assumes they exist.
- Persistent storage only **reduces** eviction risk. Users can always clear
  site data or uninstall, and browsers may still evict. The app never claims
  permanence and never nags with repeated prompts.

---

## 5. Holiday system

### Source & local dataset

- **Baseline:** the official University of Tehran Calendar Center /
  Geophysics Institute national calendar for **1405**, normalized into
  `public/holidays.json` (factual dates + names only — the publisher PDF
  itself is **not** redistributed). Cross-checked against the timestamp.ir
  1405 holiday list and the bahesab.ir 1405 calendar.
- **Seeded coverage:** 26 official-holiday dates, `1405-01-01`…
  `1405-12-29` (Gregorian `2026-03-21`…`2027-03-20`), dataset version
  `1405.1.0`. Fridays always use the holiday timetable by rule on top of
  this. No 1406 data is bundled (no authoritative source available yet —
  unknown, never invented).
- **Count note:** some secondary summaries say “25”; they omit
  `1405-01-25` (Martyrdom of Imam Jafar al-Sadiq, 25 Shawwal). The published
  calendar marks it تعطیل and the Farvardin holiday count is 7, so this
  dataset ships 26 dates and documents the discrepancy here instead of
  silently dropping a holiday.
- **Lunar-date caveat:** qamari observances depend on moon-sighting and may
  shift ±1 day by official announcement; the rolling sync below exists to
  catch exactly that.

### Known / unknown semantics

- Records carry an explicit state: `holiday` | `non-holiday` | `unknown`.
- A missing record is **unknown**, never a confirmed normal day. Routing
  falls back to the normal day-of-week timetable for unknown dates but
  retains the unverified flag (see `lib/holidays/local-resolver.ts`).
- `kind` separates `official` calendar holidays from later-announced
  `exceptional_closure`s. Emergency/temporary metro disruptions are a
  different (future, online-only) concern and are never mixed into this
  dataset.

### Daily refresh (≈8 upstream calls/day)

- Normal operation checks **today + next 7 Tehran dates (8 total)** via
  `getTehranWeekDates()` (Tehran-timezone boundaries, never server TZ).
- One upstream `timestamp.ir` request per date → ~8 requests/day total,
  independent of user count. Never one refresh per user, never ~190/day.
- Implemented in `lib/holidays/sync.ts` (Redis-backed server cache used by
  `/api/route` and MCP) and `scripts/sync-holidays.mjs`
  (`pnpm holidays:sync`) for the file dataset. Strict rule: **only
  `is_holiday === true` counts**; titles/categories never do.
- **Failure behavior:** timeout/HTTP/malformed/invalid → preserve the
  previous known-good value, keep unknown as unknown, log, retry next run.
  A failure is never interpreted as `non-holiday`, and a baseline
  `official` holiday is never demoted by an empty API response.
- **Versioning:** the public dataset version bumps (patch) only when
  holiday information actually changes; a no-change run leaves the version
  identical (no spurious update notification). Publishing is atomic
  (tmp-file + rename) so clients never read half-written JSON.
- **Backfill (separate, manual):** `pnpm holidays:sync --backfill
  [--from=YYYY-MM-DD] [--days=N] [--max=N]` with a hard ceiling of
  190 requests/run, a persisted cursor (`data/.holidays-backfill.json`),
  and a lockfile refusing concurrent runs. Not part of normal operation.

### Client updates (offline-first, zero upstream quota)

- Routing reads the in-memory local dataset **synchronously**; it never
  waits for HTTP and browsers never contact `timestamp.ir`
  (Playwright asserts zero upstream holiday calls, online and offline).
- Startup: use bundled + persisted last-known-good copy immediately (no
  routing block); if online, compare `/holidays.version.json`; download
  `/holidays.json?v=<version>` only when newer; validate strictly; keep
  the old copy on any failure.
- A genuinely newer installed version shows a one-time notice —
  «اطلاعات تعطیلات متو به‌روزرسانی شد.» / “Holiday information has
  been updated.” — recorded per version in localStorage (never on first
  install, never repeatedly).
- User surface: compact `HolidayCard` inside the timetable sheet (today’s
  effective schedule rules, last update in Jalali, next holiday, expandable
  upcoming list, honest incomplete-coverage note). No `/holidays` route, no
  new tab. Same dataset as routing; fully offline.

---

## 6. GPS/location UX

- Location is strictly user-initiated (homepage locate button, `/nearby`
  button, map locate control). Nothing requests geolocation on launch.
- Denied / unavailable / timeout are distinguished with friendly localized
  messages; offline + usable GPS fix works (positions need no Internet);
  offline without a fix explains itself instead of failing silently.

---

## 7. Manifest & TWA navigation

- `app/manifest.ts`: `id: "/"`, `start_url: "/"`, `scope: "/"`,
  `display: "standalone"`, `theme_color #cc0e2d`,
  `background_color #0a0a0a`, 192×192 + 512×512 (+ maskable purpose),
  Persian name/description. Valid and installable.
- Navigation: internal links stay under `https://metto.ir/` (Next.js
  links, route + place-pin state preserved across tabs); external sites
  (data credits, map directions, install flows) intentionally open
  externally (`_blank` + `noopener`). No mixed-content HTTP resources.
  `geo:` intents are user-initiated only.
- No `assetlinks.json` exists yet — intentionally. It requires the real
  Android package name + signing-cert SHA-256 (see below).

---

## 8. Manual test checklist

```text
clear all metto.ir site data
↓
open Metto online (open DevTools console: watch for
"[Metto Offline]" { state: "ready", ... })
↓
calculate a station-to-station route
↓
close app/browser completely
↓
enable airplane mode
↓
reopen Metto (cold start)
↓
calculate a station-to-station route
↓
inspect timetable (incl. compact holiday card)
↓
open stations (search + station details)
↓
use nearby (incl. mocked/real GPS)
↓
open map (vectors visible + basemap offline note, no crash)
↓
search a station (works)
↓
try a landmark search (Internet-required message)
↓
restore network
↓
verify recovery + update banner behavior if a deploy happened
```

Automated equivalent: `pnpm build && pnpm test:e2e:offline`
(Playwright, production server, real browser offline mode, mocked Tehran
geolocation `35.6892, 51.3890`; Nominatim/CARTO/Esri/upstream-holiday
intercepted and never called).

### Troubleshooting readiness

If the console never leaves `{ state: "preparing", … }`, inspect which flag
is stuck. A dedicated one-shot probe also logs
`[Metto Offline] service worker registration failed` with the real error
(console only, never UI) when registration definitively fails:

- `serviceWorkerControlled: false` + registration failure naming a
  **redirect** (`SecurityError … script … is behind a redirect`, worker
  stuck “trying to install”, empty Cache Storage) → **confirmed cause on
  protected previews: Vercel Deployment Protection.** It 302-redirects
  every request including `/sw.js`, and the Service Worker spec forbids
  registering a redirected script. Eliminated as repo causes: no
  `redirects`/`rewrites` in `vercel.json`, no middleware, no
  `redirects()`/`trailingSlash`/`cleanUrls` in `next.config.mjs`, no
  canonical-domain redirect code. Remediation (Vercel dashboard, not code):
  disable Deployment Protection for the preview environment used for PWA
  testing, or test on an unprotected staging/custom domain. Do NOT point
  registration at a redirected URL and do NOT weaken the worker.
- `serviceWorkerControlled: false` without a redirect → confirm the
  deployment ran `next build && serwist build` (Vercel `buildCommand`)
  and that `/sw.js` returns HTTP 200 directly.
- `precacheReady: false` → Cache Storage lacks the datasets: check
  DevTools → Application → Cache Storage for the `serwist-precache-*`
  entries (`schedule-data.json`, `holidays.json`).
- `scheduleReady: false` → `/schedule-data.json` never loaded (network or
  SW fetch path); `holidaysReady: false` → bundled dataset missing
  (build issue).

Production note: `GET https://metto.ir/sw.js` was verified to return HTTP
200 with no redirect hop, so production registration is unaffected; the
first activation there also purges the legacy `metto-v*` caches.

---

## 9. Future TWA steps (DO NOT perform yet)

1. Choose final Android package/application ID.
2. Generate Bubblewrap/TWA wrapper project.
3. Generate signing key.
4. Safely back up signing key (offline, redundant).
5. Obtain signing-certificate SHA-256 fingerprint.
6. Create real `https://metto.ir/.well-known/assetlinks.json`.
7. Verify Digital Asset Links.
8. Build signed package (AAB/APK as required by each store).
9. Test on real Android devices (install, offline, updates, deep links).
10. Prepare Café Bazaar/Myket listing, icons, screenshots, privacy info.
11. Submit to Bazaar/Myket.
