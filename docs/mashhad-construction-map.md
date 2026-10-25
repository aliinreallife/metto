# Mashhad construction map layer

`data/reference/mashhad-construction.json` is a map-only ODbL reference copied
from the companion metto-data change (source/review details are in that repo’s
`docs/mashhad-construction-map.md`). It contains five versioned OSM construction
ways: Line 3 extensions north/south of the current central section and Line 4.

This is source-reported construction geometry, not operator confirmation of
service or opening dates. The central service way 1388754301 and all proposed
stop nodes are excluded. UI colors are provisional. It adds no boarding
stations, timetable, transfer or routing graph edges; Mashhad’s public route
catalog remains Lines 1/2, 36 stations.

The layer is drawn independently of track edges in `RealMap`, is not
interactive, and is dimmed when a passenger journey is highlighted. A compact
map label explains the dashed lines. OSM attribution remains visible in both
minimalist and satellite modes. The layer is only supplied when Mashhad is
present in the selected city catalog; Tehran retains its existing construction
rendering.

Source: https://www.openstreetmap.org/copyright (ODbL-1.0), retrieved
2026-10-25. Geometry versions and source hashes are recorded in metto-data’s
`sources/mashhad/construction-map-review.json`; its pinned normalized snapshot
and `pnpm map-reference:check` reproduce the artifact offline.

To update it, review/generate the reference in metto-data, then copy that exact
artifact here. Do not insert its `osm:way:*` IDs into `CITY_EDGES`, station
pickers, or route planners. The unit guard and Mashhad browser checks enforce
this separation.

Pinned source: `aliinreallife/metto-data` commit
`b942baebcd1360f9ebcfd650c694a50c33f10165`,
[metto-data PR #23](https://github.com/aliinreallife/metto-data/pull/23).
Artifact SHA-256: `ae69e9fd1e94b7617cd228b4020f8cdf101e14926c3ff959b053f71fd1b1dece`.
