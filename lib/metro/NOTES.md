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
`line_transfer` (+walk). Conservative default: branch changes require a
train change unless timetable data proves through-running. Terminals come
from ordered route direction, never adjacency walks. Fallback (no
timetable) segments advance the same time ledger, so `travelTimeOnly` and
`estimatedArrival` stay correct.

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
