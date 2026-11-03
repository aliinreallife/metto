# City previews and Isfahan's public release

Isfahan Line 1 is now authorized for public release: 20 stations, the existing
rail corridor and the regular published timetable. It uses Metto's normal city
selector, landing, map, stations, nearby and route pages. Production totals are
207 stations / 10 lines / 3 cities. `/preview/isfahan` redirects to the normal map.

## Sources and bounded authorization

`data/reference/isfahan-candidate-preview.json` retains the original reviewed OSM
projection and its historical flags. It is pinned to metto-data commit
`1e83f67df3b3dd8e599eb416c42ed93a2a2bee7f`, graph SHA-256
`51a0d6e2c063ab84dad4037e1fa8bddc68eca8d9dc89ef5cf5d6d4bc76611099`.
Construction extensions and inactive stops remain excluded.

The separate `isfahan-service.json` public projection records the owner's
2026-11-03 authorization. Its exact metto-data revision, path and file hash are
in `isfahan-service-source.json`. Import it offline with
`node scripts/import-isfahan-service.mjs /path/to/metto-data`; the build checks
its content hash, scope, station order, null cells and monotonic times. Historical
review metadata is not silently rewritten as operator certification.

278 regular runs contain 5,136 printed times. Five conditional extra dispatches
are excluded from passenger next-train results. Times use Asia/Tehran everywhere,
including when the passenger's device is abroad. Source row, direction, source
images and source-cell audit hashes are preserved in the imported artifact.
The published station times are scheduled times, not real-time observations.
Tehran's schedule updater, fallback estimates and MCP/API remain city-scoped.

## Friday and holiday behavior

Friday no-boarding stations are بهارستان، گلستان، دانشگاه، کارگر. Route results
at those endpoints offer no departure or arrival, while physical track remains
intact for journeys between other stations. The intermediate list marks those
points without claiming that the source establishes nonstop passage. Both
22:00 final terminal departures and their 22:39 opposite-terminal times remain
available. Downstream boarding after 22:00 is not cut off prematurely.

By explicit owner instruction, non-Friday official holidays provisionally use
the Friday pattern. Every such result visibly says this is unconfirmed by the
operator, in Persian and English. The older Chamran/Kargar source discrepancy
remains recorded. Known exact-date exceptions override the general pattern.

The existing local holiday dataset covers 1405. Its unlisted dates remain
UNKNOWN in the calendar data; within coverage the app uses the normal weekday
pattern without repeating a passenger-facing warning for every normal date. Outside coverage, unknown
non-Friday dates do not receive departure promises. The October 2026 poster is
not applied to earlier dates. No Nowruz exceptions are invented, and unknown
station amenities remain omitted.

## Future city previews

`CityMeta.release` distinguishes public cities from previews. `availableCityIds`
is the server boundary for static routes and the root provider. Candidate cities
appear only in preview/development builds; `METTO_CITY_PREVIEWS=0` disables them.
Storage and query parameters cannot enable hidden cities. Preview pages are
noindex and excluded from the public sitemap.

New cities add source-backed, namespaced data to `CITY_NETWORKS` in
`lib/city-previews.ts`, plus city metadata and geographic search bounds. Preview
networks require explicit review routing, retain review notices and cannot gain
passenger authorization merely by changing a UI flag. Public Isfahan uses its
separate authorized projection. The shared app supplies map endpoints, counts,
duplicate-name isolation, nearby results and offline tab navigation.

Original rail geometry: © OpenStreetMap contributors, ODbL-1.0; see
`ATTRIBUTION.md`. Operator timetable images are referenced, not redistributed.
Shiraz remains at source-research stage.

Isfahan reuses Tehran’s `TravelTimeCard`: the same localized date display, day/time
steppers and now/depart/arrive controls. Arrive-by selects the latest published
train meeting the deadline, while requiring arrival on the selected calendar date; a train that arrives the previous evening is not eligible.
Shared URLs use the common timezone-explicit format; earlier Iran-local `at`
links remain compatible.

The route summary also reuses Tehran’s `RouteSummaryStats`: station count,
wait + travel and arrival. Isfahan supplies the selected published row, excludes
Friday boarding restrictions from the count, and omits timing cards when no
usable train exists. Map station sheets keep their compact departure display.

Collection credits for Metto-curated data link to `aliinreallife/metto-data` in
the app. `cityDataCredit` retains the individual dataset credits for Tehran and
Mashhad. Detailed original-source URLs/hashes and required map attribution remain
preserved; the visible collection link does not replace the provenance record.

Timetabled Isfahan route results reuse Tehran's journey, no-service and missed-
deadline cards. The redundant published-timetable warning and source link have
been removed from every route result; data attribution remains in the shared
footer and the full station timesheet. Date-specific calendar exceptions and
Friday no-boarding rules are still enforced, and public holidays still show
their source-specific provisional Friday rule.
