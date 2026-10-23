# Mashhad stations and route-path review

This is a default-off candidate preview for **Lines 1 and 2, 36 unique stations**.
It is not a public city launch. Line 3 is withheld pending a separate complete
service-pattern review. New dated reports support Basij's opening, while the
older OSM snapshot remains stale on that point. The public city registry, navigation,
sitemap, Tehran router and timetable API still serve Tehran.

The agreed first-release scope is stations and route paths without arrival or
travel-time estimates. A verified timetable is not a prerequisite for that
scope. Dated boarding and interchange evidence still needs review before launch.

## Run the review locally

With the repository's Node 22 and pinned pnpm installed:

```sh
pnpm install --frozen-lockfile
pnpm build
METTO_MASHHAD_PREVIEW=1 pnpm start --hostname 127.0.0.1 --port 3002
```

Open `/mashhad?lang=en` or `/mashhad?lang=fa` on that server. The flag is
server-only, checked per request, and disabled when `VERCEL_ENV=production`
even if set to `1`. Without it, the page renders Next's not-found screen
and the API returns HTTP 404. A streamed Next not-found screen can have
HTTP 200; no planner markup is rendered. The page is noindex/nofollow and
the API is no-store/noindex. The flag is not authentication: a hosted review
deployment also needs the platform's deployment protection. Do not enable it
on an unprotected public server.

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
- The FA/EN page has native labelled selectors, a station catalog, transfer
  steps and URL links. It preserves Tehran's stored origin/destination and
  does not register Tehran WebMCP tools or prime Tehran's timetable here.
  There is no new offline guarantee, entrance routing or amenities claim.
- Attribution and machine-readable ODbL database details are in
  [DATA_LICENSE.md](../DATA_LICENSE.md) and the preview footer.

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
the city registry and public app capability/navigation be wired in a separate
reviewed change. Timetables, Line 3, entrances and amenities require their own
evidence before being added.

## Validation

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
METTO_MASHHAD_PREVIEW=1 BASE_URL=http://127.0.0.1:3002 \
  PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium \
  pnpm exec playwright test tests/mashhad-preview.spec.ts tests/a11y.spec.ts
BASE_URL=http://127.0.0.1:3002 PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium \
  pnpm test:e2e:offline
```

The preview browser suite intentionally skips unless explicitly enabled against
an enabled server. Unit checks cover all 1,260 directed Mashhad station pairs,
cross-city rejection, boarding/track separation, missing interchanges and the
default-off/production gates. Existing independent Tehran tests cover all
22,650 directed pairs and 108 timetable planning cases.

Local validation on October 23, 2026 passed: 836 app unit tests in 50 files,
typecheck, lint (one pre-existing `no-img-element` warning), production build,
all 3 Mashhad browser checks, all 21 existing Tehran accessibility checks, and
all 18 offline regression checks. A second production server without the flag
rendered the not-found screen without planner markup, returned HTTP 404 from
the Mashhad API, and continued serving Tehran routes. The companion data
commit passed all 64 tests, typecheck, validators, provenance and workflow
checks; the Mashhad release check failed as expected while Tehran passed.

These are local validation results. Review branches `feat/mashhad-route-preview`
(app) and `feat/mashhad-service-evidence` (data) have been pushed. They build on
the existing draft PRs #223 and #9 respectively. Nothing was merged or released
to production. Public Mashhad approval and the remaining station-level review
are outstanding.
