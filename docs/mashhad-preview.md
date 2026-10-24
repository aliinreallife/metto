# Multi-city app and Mashhad preview

Vercel previews and local development expose Tehran and **Mashhad Lines 1/2**.
The landing counts 187 unique stations, 9 lines and 2 cities: Tehran 151/7,
Mashhad 36/2. Production still exposes Tehran only; the data release review
has not been approved. Line 3 remains outside this first scope.

## Pages and station identity

- `/` introduces the available cities and uses their actual station/line counts.
  It retains Metto's original route preview and planner button, with small
  city links. The app retains the familiar header, search pickers, station
  cards and map styling; the city selector sits beneath the Metto name.
- `/tehran` and `/mashhad` have separate landings. Each city has `/route`,
  `/map`, `/stations` and `/nearby` pages beneath its slug.
- `/cities` combines the station directory; `/cities/map`, `/cities/route`
  and `/cities/nearby` provide the corresponding all-city views.
- The main app's city picker preserves the current tab and language, clearing
  endpoints and time options from the previous city. Old `/route`, `/map`,
  `/stations`, `/nearby` and Tehran share links continue to work.
- Global station identities include the city, such as `tehran:station:basij`
  and `mashhad:station:basij`. Combined results and choices label both name
  and city. Tehran route/map links retain their existing local station slugs.
  Cross-city metro routes are rejected; maps never join different cities.
- Mashhad's map contains all 36 scoped stations and route highlights. Its
  planner gives stations, line changes and route links without time estimates.
  Nearby uses opt-in GPS or a chosen station, and explicitly labels straight-line distance.
  Both point taps and keyboard center selection offer origin/destination actions
  on the map, without navigating away. Exact place pins survive map/planner tabs
  and reloads. Clearing the map preserves Tehran's planner storage.
- In the all-city Stations tab, city filter chips work alongside search, lines
  and amenities. Choosing a city clears a line filter belonging to another city;
  the main city dropdown stays on All cities.
- Both cities use the same `RouteFields`, `StationCombobox`, itinerary
  `SegmentView`, `StationCardView`, `StationDetailView`, `NearbyLocation` and
  `RealMap` components. Mashhad supplies namespaced data and no timetable.
  Its travel/arrival summary values are blank, while map labels, controls,
  GPS and offline tile recovery follow the existing map implementation.
  The styled city list supports arrows, Enter/Space, Escape, outside dismissal
  and selected-state announcements in FA/EN.

## Run locally

With Node 22 and the repository's pinned pnpm:

```sh
pnpm install --frozen-lockfile
VERCEL_ENV=preview pnpm build
VERCEL_ENV=preview pnpm start --hostname 127.0.0.1 --port 3003
```

Open `/mashhad/map?lang=en` or `/cities?lang=fa`. Development and Vercel
preview environments enable Mashhad automatically. Alternatively, set
`METTO_MASHHAD_PREVIEW=1` for **both build and start** of a local production
build. Set it to `0` to opt out. `VERCEL_ENV=production` always disables
Mashhad, including its pages, API, city picker option and landing counts.
The API gate is also checked per request. Mashhad pages are noindex/nofollow;
Vercel preview metadata disables indexing for all pages. This feature flag is
not authentication; platform deployment protection still applies.

## Data and behavior

- `data/previews/mashhad/manifest.json` pins four exact Git blobs at
  `metto-data@af057821dee7cbd5fcd2bf9ebde079070d8ac20c`. The full candidate
  remains intact on disk; the adapter exposes only Lines 1/2. Builds verify
  its hashes, candidate status, line scope and explicit Shariati links offline.
- `lib/city-route-path.ts` keeps station boarding separate from operational
  tracks, requires explicit directed interchange links, and chooses the fewest
  line changes followed by the fewest track hops. It returns station sequences,
  line legs, stop counts and changes. It cannot return clocks, durations, ETAs
  or headways. A path is a topology assertion, not proof that service is running.
- The Shariati links are candidate connectivity for review, without a walking
  duration or accessibility claim. Shared names or coordinates cannot create
  interchanges automatically. Branching service patterns are rejected until
  explicitly supported.
- `GET /api/cities/mashhad/route?from=mashhad:station:airport&to=mashhad:station:tabarsi`
  returns a city-scoped path with `reviewOnly: true` and `timing: "unavailable"`.
  Unknown/Tehran endpoints, Line 3-only stations, identical endpoints and all
  query parameters besides `from`/`to` return HTTP 400.
- The FA/EN planner reuses the existing labelled station-search picker,
  transfer steps and URL links, with a separate station directory. It
  preserves Tehran's stored origin/destination and
  does not register Tehran WebMCP tools or prime Tehran's timetable here.
  The extra station-directory/source sections have been removed from the
  route page. Its actions reuse Tehran's directions and copy-link controls.
  There is no new cold-offline guarantee or entrance routing.
- The original upstream amenities are available as **source reports**, explicitly
  labelled unverified in cards, map details and filters. The added untouched
  `upstream-stations.json` is pinned to upstream commit `f5d5c78816a8cc360bb9ae00db8fb8bad23a29e0`,
  blob `3b127905e73d3d6b28d0a94ac190d8395b85e6a6`. The display adapter maps only
  matching facilities (`metroPolice` to police and `bicycleParking` to the
  existing Bike parking category). Missing facilities remain unknown. Canonical null amenities and
  `amenitiesVerified: false` stay unchanged, and no facility is certified.
- Attribution and machine-readable ODbL database details are in
  [DATA_LICENSE.md](../DATA_LICENSE.md) and the app credits.

## Missing-timetable estimates

Run `pnpm estimates:evaluate` for the reproducible Tehran comparison, described
in [the estimate audit](route-estimates.md). Regular ride-only error averages
2.03 minutes; the small complete-journey matrix averages 8.10 minutes with one
leg masked and 11.59 minutes with all timetables masked. Missing waits make
arrival estimates optimistic. The app explains this when a leg is estimated.
No speed, timing, timetable identity or routing behavior was changed. The audit
also records legacy ambiguous timetable names for separate source review.
These results do not enable Mashhad timing.

## Evidence and release boundary

The companion data branch `feat/mashhad-service-evidence` records versioned
OpenStreetMap evidence at `85be8c6`: 24 ordered Line 1 stops, 13 Line 2 stops,
and Fajr's representative point independently corroborated.

Its continuation `eaf6f674291a0f0e1559d1388896695b342f13df` records ten dated
Shahrara reports, including operator/council statements and passenger field
reporting. These support current Line 1/2 service, the Airport/Reyhaneh and
Fakouri endpoint reopenings, and passenger changes in both directions at
Shariati. Reports on August 9, August 26 and October 22, 2026 corroborate
Basij's opening and the Line 1/3 connection, giving stronger evidence than the
older OSM proposed-stop tag. Line 3 stays outside the first scope. The operator
site still timed out; ISNA returned a browser-check page without article content.

The data command `pnpm quality:report` now emits
`.quality-report/mashhad-path-review.json`: 36 stations, 37 boarding assertions,
35 edges and two directed **untimed** Shariati links. It binds the projection
and evidence to a fingerprint, distinguishes line-level reports from
station-specific support, and always retains `releaseReady: false`. Its
integrity checks and all 70 data tests pass. Station-level operator review and
approval of the exact scoped artifact remain outstanding.

No canonical dataset, app source pin or runtime route changed during this
evidence continuation. See `metto-data/docs/mashhad-source-review.md`,
`sources/mashhad/service-evidence.json` and `sources/mashhad/review.json` for
the records, source limitations and remaining blockers.

The data release gate still rejects Mashhad. This preview does not bypass or
approve that gate. A public Lines 1/2 release needs an explicit reviewed scope,
dated stop/interchange evidence and a dataset-bound review. Only then should
production city availability be enabled in a reviewed change. Timetables, Line 3, entrances and verified amenity claims require their own
evidence before being added. Displaying a source report does not approve it.

## Validation

```sh
pnpm lint
pnpm typecheck
pnpm test
VERCEL_ENV=preview pnpm build
# Start the preview build as above, then:
BASE_URL=http://127.0.0.1:3003 PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium \
  pnpm exec playwright test tests/multi-city.spec.ts tests/mashhad-preview.spec.ts tests/a11y.spec.ts
BASE_URL=http://127.0.0.1:3003 PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium \
  pnpm test:e2e:offline
```

City browser checks probe the deployment's API and run when Mashhad is
available. They cover landing totals, switching the main map, map-to-route
links, city-qualified duplicate station names, cross-city rejection and a
narrow Persian layout. Unit checks cover all 1,260 directed Mashhad station
pairs and production gating. Independent Tehran regression checks preserve
all 22,650 directed station pairs and 108 timetable planning cases.

Existing offline behavior remains covered. Explicit Tehran and all-city static
pages share the canonical document fallback. No new cold-offline guarantee is
made for Mashhad pages. Entrances are not inferred, and source amenities are not verified facts.

Review branches are `feat/mashhad-route-preview` (app PR #224, based on #223)
and `feat/mashhad-service-evidence` (data PR #10, based on #9). Nothing in
this work approves the data review or enables Mashhad in production.
