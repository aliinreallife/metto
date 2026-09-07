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
