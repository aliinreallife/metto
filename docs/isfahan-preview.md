# City previews inside Metto

Isfahan is available on preview builds through the normal city selector and
`/isfahan`, `/isfahan/route`, `/isfahan/map`, `/isfahan/stations`, and
`/isfahan/nearby`. The original `/preview/isfahan` link redirects to the normal map.
It uses the same navigation, station cards, route form, map and nearby directory
as other cities. There is no separate review application.

## Release boundary

`CityMeta.release` in `lib/cities.ts` distinguishes public cities from candidate
previews. `availableCityIds()` is the server boundary used by static route
registration and the root provider. Preview cities are included on Vercel preview
builds and local development, and excluded from production builds. Setting
`METTO_CITY_PREVIEWS=0` disables them even on previews. Query parameters and
browser storage cannot enable a hidden city.

The selector and landing links label candidate cities “Preview”. Their normal
app screens retain a short review notice and source link. Their station cards
state unverified/disputed boarding rather than incorrectly marking the whole
city as under construction. Unknown amenities are omitted. Candidate city pages
are noindex and are never added to the production sitemap, even in a preview
build. Production station/line totals remain 187/9; this preview totals 207/10.

## Adding another city preview

1. Prepare a pinned candidate dataset with city-scoped station/line/route IDs,
   explicit track connections, reviewed physical identities, source attribution
   and rail geometry. Do not infer connections or transfers from similar names,
   street routes or coordinate proximity.
2. Add the city's metadata to `CITIES`: slug/name, `release: "preview"`, geographic
   search bounds, and an optional local landmark example. Unknown cities never
   inherit Tehran's search bounds or Iran Mall suggestion.
3. Register its `CityPreviewDefinition` in `lib/city-previews.ts`: source URL,
   bilingual review notice, path network and original track geometry. The normal
   app automatically includes the city in selection, landings, counts, combined
   search/filtering, all-city map, route/map endpoints and city tabs. No new city
   screen is needed. Existing public Mashhad uses the same untimed route screen.
4. Run lint, typecheck, unit tests, a preview build, and the browser flows. Check
   keyboard/mobile access, duplicate names across cities, foreign endpoints,
   saved-trip isolation, source geometry, nearby search and offline tab navigation.
5. Publish the branch to inspect its Vercel preview before any production release.

Releasing passenger service is a separate data review: a metadata change alone
must not certify candidate boarding or track data. The ordinary path planner
rejects review statuses unless explicitly constructed in review mode. Candidate
paths carry `reviewOnly: true`, have no timetable/arrival estimates, and do not
activate Tehran's timetable/MCP integration. Selections use each city's own
storage keys and retain namespaced IDs through map, route, reload and sharing.
Offline navigation recognizes registered city paths; only the documents actually
included in that deployment's static build are cached.

## Current Isfahan source

The 20-station projection in `data/reference/isfahan-candidate-preview.json` is
pinned to the deterministic report at metto-data commit
`1e83f67df3b3dd8e599eb416c42ed93a2a2bee7f` (PR #37), with its original SHA-256.
Construction extensions and inactive stops are excluded. Boarding at Daneshgah
and Kargar is unresolved. Other boarding/amenity/timetable facts are unverified;
this is a preview, not passenger release authorization.

Original source: © OpenStreetMap contributors, ODbL-1.0. See `ATTRIBUTION.md` and
the pinned source PR. Shiraz remains in source research until a complete candidate
network is available; the preview mechanism does not invent missing tracks.
