# Metto — متو | Tehran Metro Route Planner

Metto (متو) is a free, fast, bilingual (فارسی / English) web app for navigating the Tehran Metro — live at **[metto.ir](https://metto.ir)**.

Find the fastest route between any two stations with timetable-aware ETAs, browse all stations across 7 lines, find the nearest station by GPS or amenity, and share routes via link.

Built by [aliinreallife](https://github.com/aliinreallife) · Metro data by [mostafa-kheibary/tehran-metro-data](https://github.com/mostafa-kheibary/tehran-metro-data)

## Features

- **Route planner** (`/`) — origin/destination search by station *or place name* (e.g. "Iran Mall" resolves to its nearest station), swap, geolocation origin, shareable URLs (`?from=tajrish&to=tehran-sadeghiyeh`)
- **Timetable-aware ETA engine** — real departure/arrival propagation per leg (initial wait, ride, transfer walk + wait, train-change wait), station-specific transfer walks, Line 5 express trains, midnight-crossing + holiday-aware day types (شنبه تا چهارشنبه / پنجشنبه / جمعه / تعطیل)
- **Stations** (`/stations`) — filterable list of 151 stations with lines, amenities, departures and full-day timesheets
- **Real map** (`/map`) — interactive Leaflet map with minimalist + satellite styles, line toggles, station details
- **Nearby** (`/nearby`) — GPS-based nearest stations, amenity filter (restroom, elevator, ATM, Wi-Fi…), directions links
- **Bilingual + RTL** — full FA/EN UI with Persian digits, Jalali-aware scheduling
- **PWA** — installable, offline-capable shell, SEO/sitemap/robots + OpenGraph

## Tech stack

- **Next.js 16** (App Router) · **React 19** · **Tailwind CSS 4** · **shadcn/ui**
- **Leaflet / react-leaflet** for maps · **jalaali-js** for Jalali dates
- **Upstash Redis** (holiday cache) · **timestamp.ir** (holiday source) · **Vercel Cron** (daily sync)
- **vitest** for tests · **MCP SDK** for AI integration

## Getting started

```bash
pnpm install
pnpm dev      # http://localhost:3000
```

```bash
pnpm build && pnpm start
pnpm test     # vitest run
pnpm lint
```

## Environment variables

Copy `.env.example` to `.env.local`. Only needed for holiday-aware timetables (without them the app falls back to weekday/weekend logic):

| Variable | Purpose |
|---|---|
| `TIMESTAMP_IR_API_KEY` | Server-side key for timestamp.ir (sent as `X-API-Key`, never to browser) |
| `CRON_SECRET` | Protects `GET /api/cron/sync-holidays` (`Authorization: Bearer <secret>`) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Holiday cache (or `KV_REST_API_URL` / `KV_REST_API_TOKEN` from the Vercel Marketplace integration) |

Set them in Vercel Project Settings → Environment Variables for production.

## How it works

### Routing (`lib/route.ts`)

Dijkstra over `(station, line, route)` states:

- Same-route continuation is free; same-line route change = **train change** (penalty, shown as "Change trains", not counted as a transfer); different line = **line transfer** (+ station-specific walk, default 4 min)
- One absolute instant propagates chronologically — walk is applied *before* the connecting departure is searched, so missed connections are never shown as caught
- Timetable lookups return `found` / `missing_schedule_data` / `no_service`. Geometric fallback runs only when schedule data is missing, never when the timetable says no departure

See `lib/metro/NOTES.md` for topology decisions (Line 4 west continuity, Line 5 extensions, branch/transfer model).

### Schedules (`public/schedule-data.json`, ~5 MB)

Loaded lazily client-side (`lib/use-schedule-data.ts`, `lib/schedule-utils.ts`); route ETAs consume it via `findTripDetailed`.

### Holidays (`lib/holidays/`)

`timestamp.ir → Upstash Redis → timetable day-type selection`, synced daily by `GET /api/cron/sync-holidays` (see `vercel.json`). Tests: `holidays.test.ts`.

### Tests

```bash
pnpm test   # metro.test.ts · transfer-walk.test.ts · holidays.test.ts
```

## API

Machine-readable docs: [`/openapi.json`](https://metto.ir/openapi.json) · AI guide: [`/llms.txt`](https://metto.ir/llms.txt)

| Endpoint | Example |
|---|---|
| `GET /api/route?from=&to=` (also `from_lat/from_lng/to_lat/to_lng`) | [/api/route?from=tajrish&to=tehran-sadeghiyeh](https://metto.ir/api/route?from=tajrish&to=tehran-sadeghiyeh) |
| `GET /api/stations?line=&search=` | [/api/stations](https://metto.ir/api/stations) |
| `GET /api/station/[id]` | [/api/station/tajrish](https://metto.ir/api/station/tajrish) |
| `GET /api/nearby?lat=&lng=&limit=` | [/api/nearby?lat=35.804&lng=51.433](https://metto.ir/api/nearby?lat=35.804&lng=51.433) |

## MCP (AI assistants)

Metto exposes a Model Context Protocol server for Claude/AI agents:

- **Smithery**: [smithery.ai/servers/aliinreallifee/metto](https://smithery.ai/servers/aliinreallifee/metto) — one-click install for Claude Code, Cursor, Windsurf and other MCP clients
- **HTTP**: `POST /mcp` (streamable) — live at [metto.ir/mcp](https://metto.ir/mcp), see `app/api/mcp/route.ts`. `POST /api/mcp` ([metto.ir/api/mcp](https://metto.ir/api/mcp)) works identically as a backwards-compatible alias.
- **stdio**: `mcp-server.ts` (same tools over stdio for local clients)

Tools: `get_route`, `list_stations`, `get_station`, `find_nearby` · Resources: `metro://stations` / `metro://lines` / `metro://station/{id}` · Prompts: `plan-route` / `station-info` / `find-nearest`

## Project structure

```
app/            # routes: / (planner), /stations, /map, /nearby + /api/*
components/     # route-panel, station-detail, station-timesheet, real-map, …
lib/
  metro/        # stations, lines, routes, segments, transfers, selectors, validation
  route.ts      # Dijkstra router + ETA engine
  schedule-utils.ts / schedule-data.ts / tehran-time.ts
  holidays/     # jalali, schedule-day, store (Redis), sync, timestamp.ir client
  geo.ts / geocoding.ts / i18n.ts
public/
  schedule-data.json  # timetables
  openapi.json / llms.txt
scripts/generate-stations.ts
```

## Contributing

PRs welcome — especially timetable corrections, station coordinates/amenities, and translations. Please run `pnpm test` and `pnpm lint` before submitting.

## License

This is a multi-license repository, not a single-license one:

* **Metto original code** is licensed under the GNU Affero General
  Public License version 3 only (`AGPL-3.0-only`) — see `LICENSE`.
* **Tehran Metro station/network data** derived from
  [tehran-metro-data](https://github.com/mostafa-kheibary/tehran-metro-data)
  is licensed separately under the Open Database License v1.0
  (`ODbL-1.0`) — see `DATA_LICENSE.md`.
* **Third-party software and assets** (libraries, fonts, icons, map
  tiles/services, images) remain under their respective licenses/terms.
  Note `react-leaflet` is Hippocratic-2.1 (non-OSI), which creates a
  potential AGPL distribution compatibility concern — see `NOTICE.md`.
  Recommend removing it if unused.

See `NOTICE.md` for the full licensing overview.
