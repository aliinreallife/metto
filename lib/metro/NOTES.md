# Metro data migration notes

## Topology (authoritative)

- Line 4 west is ONE continuous route:
  `... eram-e-sabz -> allameh-jafari -> ayatollah-kashani -> chaharbagh`.
  Eram <-> Allameh is operational; Allameh <-> Kashani and Kashani <->
  Chaharbagh are under-construction tracks. Kashani's Line 4 *stop* is
  therefore `under_construction` while the physical station (Line 6) is
  `operational`. There is no `line-4-chaharbagh` branch; the Mehrabad fork
  at Bimeh remains the only Line 4 branch.
- Line 5 west: `... golshahr -> shahid-fakhrizadeh ->
  shahid-sepahbod-qasem-soleimani`, all operational. No direct
  Golshahr <-> Soleimani edge.
- Station count: 151. Segments: 163, of which 6 under construction
  (2× L4 west extension, 4× L6 southern extension Dowlat Abad -> Haram).

## Station status vs stop status vs track status

Three independent facts:

1. `station.status` — physical infrastructure (boardable iff operational).
2. Per-route stop status (`MetroRoute.stops[].status`) — e.g. Kashani is
   operational on Line 6, under construction on Line 4.
3. `segment.status` — track. Defaults to operational for every generated
   segment; the 6 unfinished tracks are listed explicitly in
   `SEGMENT_STATUS_OVERRIDES`. Nothing is derived from station status.

Boarding rule: `canBoardAtStation(id, line?)` = station operational AND
stop operational. Pass-through: operational tracks are traversable even
through non-boardable stations (Vavan); such stations are never trip
endpoints, never transfer points, and never counted in `numStops`.

## Routing model

Dijkstra over (station, line, route). Same-route continuation is free;
same-line route change = `train_change` (split segment, penalty, shown as
"Change trains", does NOT increment `numTransfers`); different line =
`line_transfer` (+ station-specific walk from `metro/transfers`, default 4
min; Dijkstra penalty scales with the walk, so Eram-e Sabz L4<->L5 at 8 min
ranks worse than ordinary interchanges). Conservative default: branch changes
require a train change unless timetable data proves through-running.
Terminals come from ordered route direction, never adjacency walks.

ETA engine (`lib/route.ts`): one absolute `currentInstant` (epoch ms)
propagates chronologically — walk is applied BEFORE the connecting departure
is searched, waits/ride/walk accumulate as integer seconds
(`initialWait/ride/transferWalk/transferWait/trainChangeWait`), and
`estimatedArrival` is the final instant rendered in Asia/Tehran (null when
the timetable reports no service; partial progress kept in
`reachableUntil*`). Timetable lookups return found / missing_schedule_data /
no_service per leg; geometric fallback runs only when schedule data is
missing, never when the timetable says no departure. Fallback (no
timetable) segments advance the same ledger, so `travelTimeOnly`
(ride + walk, no waits) and `estimatedArrival` stay correct.

## Status decisions

Now operational: Shahr-e Parand, Shahr-e Ziba, Shahran, Kouhsar,
Ayatollah Kashani (physical/L6), Shohada-ye Kan, Meydan-e Khorasan,
Varzeshgah-e Takhti. Still under construction: Vavan (track through it
is operational), Chaharbagh, and the southern L6 tail Haram / Abdol-Azim
Sq / Ebn-e Babviyeh / Cheshmeh Ali (+ their 4 tracks).

## Shahid Fakhrizadeh (new record)

Supplied coordinates (35.91758, 50.79110) and names used verbatim.
Amenities recorded all-false with `amenitiesVerified: false` — false here
means UNVERIFIED, not confirmed absence. Aliases: Shahid Fakhrizade,
Mammut (+ fa variants), metro-station forms.

## Shahid Sepahbod Qasem Soleimani coordinates (corrected)

Was `35.8261, 50.8881` (upstream). Now `35.95882966952798,
50.71920151458703` (supplied pin). The old value created an eastward
dogleg (Fakhrizadeh at lng 50.7911 sat west of the supposed terminus);
the corrected chain Golshahr -> Fakhrizadeh (16.4 km) -> Soleimani
(7.9 km) runs monotonically west-northwest toward Hashtgerd/Mehestan,
consistent with the ~25.8 km Karaj-Mehestan line. Wikipedia's
`35.8250, 50.9329` duplicates Golshahr's coordinates and was rejected.

## Other aliases

Historical: Shahid Nejatollahi -> maryam-e-moghaddas. Transliteration
variants (canonical IDs unchanged): Gholhak, Darvazeh Dowlat, Pirouzi,
Garmdarreh, Atmosfer.

## Unresolved / needs human verification

1. Southern L6 tail (Dowlat Abad southward) construction state beyond the
   4 listed tracks/stations.
2. Vavan opening status (kept non-boardable).
3. Whether any timetabled service runs through Parand/Mehrabad junctions
   without train change (currently assumed to require one).
4. Transliteration canonicalization kept app spelling (qolhak etc.).

## Routing preference (current policy + future options)

Current default policy: **fewest transfers wins ties of time**. The Dijkstra
cost (`RIDE_COST=1`, `TRANSFER_PENALTY=5`, walk-scaled Eram-e Sabz = 11)
deliberately prices a transfer above its pure seconds cost (walk + typical
wait), because transfers also cost inconvenience (stairs, crowds,
missed-connection risk) that timetables cannot see. Do not "fix" the penalty
to match stopwatch seconds without reading the rest of this section.

Recalibration experiment (Sep 2026, reverted): penalty 5 -> 3 with walk
scaling capped at 1.5x (standard transfer 6 -> 4, Eram 11 -> 5.5, calibrated
against schedule-data.json medians: urban hop ≈ 120 s, L5 hop ≈ 360 s).
Full all-pairs sweep (22,650 ODs): 1,472 paths changed (6.5%), ~1,393 faster
in real-seconds terms (best: L7-north -> downtown up to -11 min; Karaj ->
Beheshti 112 -> 99 min), 51 slightly worse (worst +4 min). Reverted because:
(a) cheaper transfers introduced exact-cost ties (403 flips) decided by heap
order, including backtracking itineraries (e.g. Eram -> Sadeghiyeh -> back
east on L5); (b) static costs cannot see headways, so L7-heavy reroutes
sometimes lose real minutes on low-frequency days; (c) product call: the app
currently promises least-changing-lines behavior, and choppy 2-transfer
itineraries feel worse than the minutes suggest. The sweep harness pattern
(temp tsx script over all pairs, before/after diff) is the required
validation for ANY future cost change.

Future: user-selectable routing preference. Sketch (not implemented):
- `RoutePreference = "fewest-transfers" (default) | "fastest" | "least-walking"`.
- Same Dijkstra, different weight presets — no logic fork. "fastest" uses
  static-seconds weights (per-line median hop seconds, walk + half-headway
  waits); full timetable-driven path search is explicitly out of scope until
  schedule data is available at path-choice time on all clients.
- Deterministic tie-break on exact cost ties (fewer transfers, then fewer
  hops) so outcomes never depend on heap order.
- Plumbing: `FindRouteOptions.preference`, `?preference=` on GET /api/route,
  optional MCP `preference` input (additive only), UI selector in the route
  panel persisted like `mapMode`.
- Advanced routing (later): avoid-line/station list, step-free-only (needs
  elevator data per interchange first), departure-time-aware PATH choice
  (today only the ETA varies with departure; the path is static).
- Guardrail: any default-weight change must re-run the all-pairs sweep and
  attach the improved/tied/worsened counts plus worst-case examples.
