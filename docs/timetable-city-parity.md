# Metto timetable-enabled city parity contract

**Tehran is the canonical passenger UI for every city with a usable published timetable, regardless of `release: "public" | "preview"`.** The release flag controls discovery/SEO, not route features.

## Shared by design

- `TravelTimeCard`: Now, depart at, arrive by; timezone-explicit links; date picker and stale-time handling.
- `TimetabledJourneyFrame`: arrival-mode live countdown to reach the origin station; three summary cards; noteworthy waits; travel-time explanation; and the shared train itinerary component.
- `PastTimeNotice`, `MissedDeadlineCard`, `NoServiceCard`, `SameStationNotice`, `WalkSuggestCard`: same messages, buttons and accessibility semantics.
- Same-station places offer a direct walk (including approximate fallback) instead of a fictitious train. Station-only same-station searches show the shared empty state.
- A walk is compared to metro **only** when a source-backed trip exists and a verified walking route has arrived. Early morning service waits are excluded from the comparison, per Tehran's rule.
- Route actions and nonintrusive rating eligibility are available for successful timetable journeys, including preview cities with an adapter.
- Time preferences and exact place pins survive route, map, station and nearby tab navigation and reloads. City changes discard foreign stations.
- Map pins for two distinct places nearest the *same* station are combined into one walking guidance card, as in Tehran.

## City adapter boundary

`CityRoute` always reads `getCityMeta(city).timing` — never `release` — and dispatches a timetable-enabled result to a **registered** source-backed journey adapter. The registry is exhaustive over non-Tehran city IDs; a city marked `timing: true` without an adapter must not silently render an untimed geometric route. Only timetable-specific data belongs to an adapter: stations, trip departures and arrivals, stop restrictions, day patterns, and source attribution.

Currently Tehran uses its mature timetable/routing engine; Isfahan provides published Line 1 rows and the specific Friday no-boarding exceptions. Mashhad is still explicitly untimed. The engine implementations and timetable datasets need not be identical; the passenger interaction contract does.

## Review checklist

1. Same origin/destination without pins: empty state, no fake itinerary.
2. Same station with **two different place pins**: direct walk, merged map guidance, no train.
3. Arrive-by with an actual future departure: seconds-ticking countdown, first-station name, journey summary.
4. Missed arrive-by and post-service: correct shared action cards and no invented trains.
5. Selected time in the past: shared Use now / Edit time card, no route.
6. Departure/wait/arrival source rows: station-count and travel-time cards agree with published timetable.
7. Normal, Friday and listed holiday: correct source-specific schedule and boarding restrictions; no recurring unknown-day noise on normal covered dates.
8. Switching route ↔ map ↔ stations ↔ nearby preserves the complete time plan, pins and language.
9. Visual/keyboard/RTL accessibility and narrow mobile UI follow the shared components.
10. Lint, typecheck, unit tests, and *all* preview Playwright shards pass before merging.

## Deliberately data-specific

- Tehran has multi-line transfers and distinct Thursday/Friday timetable patterns; Isfahan currently has one published line and a Sat–Thu/Friday pattern.
- City maps, station lists and directions use their own coordinates, names, status and available amenity data.
- Isfahan holiday-operation assumptions must remain explicit where the operator has not confirmed its exceptional timetable. A normal weekday within the bundled calendar's coverage does **not** receive a generic unverified warning.
- No city should gain realtime positioning, verified holidays, or a missing train solely to match a visual example.


## Tabriz review adapter (November 2026)

Tabriz Line 1 uses the canonical Tehran timetable experience in **preview**
for 18 operating stations. Its line geometry and station positions are
OpenStreetMap-derived and the imported TimeMetro dataset supplies 57
normal-day and 49 holiday rows per direction. Every timetable trip comes
from an original, complete station-by-station row.

**Do not promote as operator-verified timetable data.** The TimeMetro CSV
ends at 20:10 from El Goli and 20:30 from Noor on normal days, while other
autumn-1405 sources give later departure times (20:40 and 21:15). Thursday
patterns also disagree between secondary sources. For now normal service
is provisionally chosen for Thursday; the UI calls it out explicitly.
Never synthesize missing evening trains to make the schedule look complete.

Remaining release gate: confirm latest station-by-station departures and
Thursday/public holiday service patterns against Tabriz operator notices,
then update the source release and tests. Public preview users can inspect
the source and should rely on official station announcements for last trains.
