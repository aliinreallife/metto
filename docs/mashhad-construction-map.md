# Mashhad construction map layer

`data/reference/mashhad-construction.json` is a map-only ODbL reference copied
from metto-data. Source/review details are in that repository's
`docs/mashhad-construction-map.md`. It covers five versioned OSM construction
ways: Line 3 extensions north/south of the current central section and Line 4.

The display selects named mapped stops plus section endpoints in source order,
then draws straight dashed connections, matching Tehran's display style. It
avoids tracing every tunnel bend; no street-routing service is involved.
Thirty future stop positions are shown as hollow reference markers with line
context in their accessible tooltips. Their names and positions are source
reports, not operator confirmation of service, entrances or opening dates.
Colors are provisional. The operating central way 1388754301 is excluded.

Reference stops remain separate from boarding stations, station pickers and
routing edges. They cannot be selected as journey endpoints and do not add
transfers or timetable information. Mashhad's public routing catalog remains
36 stations on Lines 1/2. The layer is only supplied when Mashhad is selected;
Tehran retains its existing construction rendering.

`RealMap` renders the dashed sections and future markers independently of the
passenger graph and dims them when highlighting a journey. Keyboard focus
opens a reference marker's tooltip. A compact legend explains Lines 3/4 future
sections and stations. OSM attribution remains visible in both basemap modes.

Source: https://www.openstreetmap.org/copyright (ODbL-1.0), retrieved
2026-10-25. Way/node versions, source hashes and the projection rules are
recorded in metto-data. Its pinned snapshot and `pnpm map-reference:check`
reproduce the artifact offline; canonical city builds do not consume it.

To update, review/generate the reference in metto-data and copy the exact
artifact here. Do not insert its OSM IDs into `CITY_EDGES`, station pickers or
route planners. Unit and Mashhad browser checks enforce that separation.

Pinned source: `aliinreallife/metto-data` commit
`16cbd5be176d7d8782cbab5719ca6318347ef05b`,
[metto-data PR #23](https://github.com/aliinreallife/metto-data/pull/23).
Artifact SHA-256: `c6b80677316062c596e6ed0dd59dc944143e784e9e518ca01fd5487a5de1d10e`.
