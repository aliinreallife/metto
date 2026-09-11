// Client-safe WebMCP executors (browser + offline capable).
//
// Same tool surface and wording as the remote MCP servers, but execution goes
// through the client-safe domain path directly (findRoute + selectors +
// nearestStations over the precached schedule/holiday datasets) — never by
// tunneling to /mcp. Server-only schedule-server.ts is NOT imported here.
//
// Temporal input contract (mirrors remote MCP exactly): `depart_at` is the
// ONLY caller-supplied temporal input — an optional ISO-8601 instant with
// explicit offset/Z, defaulting to now. The Tehran service-day timetable is
// derived internally per routing leg. No day_type/is_holiday/weekday input
// exists or is accepted.

import { STATION_MAP, findRoute } from "../route";
import { nearestStations } from "../geo";
import {
  getAllStations,
  getStationLines,
  getStationNeighbors,
} from "../metro/selectors";
import type { IsHolidayDate } from "../holidays/types";
import { getLocalIsHolidayDate } from "../holidays/use-holiday-data";
import type { WebMCPToolResult } from "./webmcp-types";
import {
  INVALID_DEPART_AT_ERROR,
  TOOL_FIND_NEARBY,
  TOOL_GET_ROUTE,
  TOOL_GET_STATION,
  TOOL_LIST_STATIONS,
  buildCanonicalRouteUrl,
  formatNearbyText,
  formatNoRouteText,
  formatRouteSummary,
  formatStationListText,
  formatStationText,
  parseDepartAtParam,
  stationListNotFoundText,
  stationNotFoundText,
} from "./tool-defs";
import { buildScheduleNote } from "./schedule-note";

export type ClientExecutorOptions = {
  /** Cooperative cancellation (domain calls are synchronous). */
  signal?: AbortSignal;
  /** Injectable clock (tests). Defaults to now. */
  now?: Date;
  /** Injectable holiday resolver (tests). Defaults to the local dataset. */
  isHolidayDate?: IsHolidayDate;
};

function textResult(text: string, structuredContent?: unknown): WebMCPToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent === undefined ? {} : { structuredContent }),
  };
}

function errorResult(text: string): WebMCPToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function checkCancelled(signal?: AbortSignal): WebMCPToolResult | null {
  if (signal?.aborted) return errorResult("Request cancelled.");
  return null;
}

function asRecord(args: unknown): Record<string, unknown> | null {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return null;
  return args as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function executeGetRoute(
  args: Record<string, unknown>,
  opts: ClientExecutorOptions,
): WebMCPToolResult {
  const cancelled = checkCancelled(opts.signal);
  if (cancelled) return cancelled;

  const from = asNonEmptyString(args.from);
  const to = asNonEmptyString(args.to);
  if (!from || !to) {
    return errorResult("Missing required parameters: 'from' and 'to' station IDs.");
  }

  const origin = STATION_MAP.get(from);
  const dest = STATION_MAP.get(to);
  if (!origin || !dest) {
    const available = Array.from(STATION_MAP.keys()).slice(0, 30);
    return textResult(stationListNotFoundText(available));
  }

  let departAt = opts.now ?? new Date();
  if (args.depart_at !== undefined) {
    if (typeof args.depart_at !== "string" || !parseDepartAtParam(args.depart_at)) {
      return errorResult(INVALID_DEPART_AT_ERROR);
    }
    departAt = parseDepartAtParam(args.depart_at) as Date;
  }

  const isHolidayDate = opts.isHolidayDate ?? getLocalIsHolidayDate();
  const route = findRoute(origin.id, dest.id, { departAt, isHolidayDate });
  if (!route) {
    return textResult(
      formatNoRouteText(origin.name.fa, origin.name.en, dest.name.fa, dest.name.en),
    );
  }

  const minutes = Math.round(route.estimatedSeconds / 60);
  const scheduleNote = buildScheduleNote(departAt, isHolidayDate, route.legTiming);
  const canonicalUrl = buildCanonicalRouteUrl(origin.id, dest.id);
  const summary = formatRouteSummary({
    originFa: origin.name.fa,
    originEn: origin.name.en,
    destFa: dest.name.fa,
    destEn: dest.name.en,
    stops: route.numStops,
    transfers: route.numTransfers,
    travelTimeMinutes: minutes,
    path: route.path,
    scheduleNote,
  });
  return textResult(`${summary}\nOpen in Metto: ${canonicalUrl}`, {
    route: `${origin.name.fa} (${origin.name.en}) → ${dest.name.fa} (${dest.name.en})`,
    stops: route.numStops,
    transfers: route.numTransfers,
    travelTimeMinutes: minutes,
    path: route.path,
    hops: route.hops.map((h) => ({ from: h.from, to: h.to, line: h.line })),
    departedAt: route.departedAt,
    scheduleNote,
    canonicalUrl,
  });
}

function executeListStations(
  args: Record<string, unknown>,
  opts: ClientExecutorOptions,
): WebMCPToolResult {
  const cancelled = checkCancelled(opts.signal);
  if (cancelled) return cancelled;

  const { line, search } = args;
  if (line !== undefined && (typeof line !== "number" || !Number.isFinite(line))) {
    return errorResult("Invalid 'line' (expected a line number 1-7).");
  }
  if (search !== undefined && typeof search !== "string") {
    return errorResult("Invalid 'search' (expected a string).");
  }

  let results = getAllStations();
  if (line !== undefined) {
    results = results.filter((s) => getStationLines(s.id).includes(line));
  }
  if (search) {
    const q = (search as string).toLowerCase();
    results = results.filter(
      (s) => s.name.en.toLowerCase().includes(q) || s.name.fa.includes(search as string),
    );
  }
  const list = results.map(
    (s) => `${s.name.fa} (${s.name.en}) — Lines: ${getStationLines(s.id).join(", ")}`,
  );
  return textResult(formatStationListText(results.length, list), {
    count: results.length,
    stations: results.map((s) => ({
      id: s.id,
      name: s.name.en,
      fa: s.name.fa,
      lines: getStationLines(s.id),
    })),
  });
}

function executeGetStation(
  args: Record<string, unknown>,
  opts: ClientExecutorOptions,
): WebMCPToolResult {
  const cancelled = checkCancelled(opts.signal);
  if (cancelled) return cancelled;

  const id = asNonEmptyString(args.id);
  if (!id) return errorResult("Missing required parameter: 'id' station ID.");
  const station = STATION_MAP.get(id);
  if (!station) {
    const available = Array.from(STATION_MAP.keys()).slice(0, 30);
    return textResult(stationNotFoundText(id, available));
  }
  const amenityList = Object.entries(station.amenities)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  return textResult(
    formatStationText({
      fa: station.name.fa,
      en: station.name.en,
      lines: getStationLines(station.id),
      lat: station.location.lat,
      lng: station.location.lng,
      amenities: amenityList,
    }),
    {
      id: station.id,
      name: station.name.en,
      fa: station.name.fa,
      lines: getStationLines(station.id),
      coordinates: { lat: station.location.lat, lng: station.location.lng },
      connectedTo: getStationNeighbors(station.id).map((n) => n.stationId),
      amenities: amenityList,
    },
  );
}

function executeFindNearby(
  args: Record<string, unknown>,
  opts: ClientExecutorOptions,
): WebMCPToolResult {
  const cancelled = checkCancelled(opts.signal);
  if (cancelled) return cancelled;

  const { lat, lng, limit } = args;
  // Location is used ONLY from explicit tool input — never browser geolocation.
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return errorResult("Invalid 'lat' (expected a latitude between -90 and 90).");
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return errorResult("Invalid 'lng' (expected a longitude between -180 and 180).");
  }
  if (
    limit !== undefined &&
    (typeof limit !== "number" || !Number.isFinite(limit))
  ) {
    return errorResult("Invalid 'limit' (expected a number, max 20).");
  }
  const clamped = Math.min(Math.max(Math.floor(limit ?? 5), 1), 20);
  const results = nearestStations(lat, lng, { limit: clamped });
  const list = results.map(
    (r) => `${r.station.name.fa} (${r.station.name.en}) — ${r.km.toFixed(2)} km`,
  );
  return textResult(formatNearbyText(lat, lng, list), {
    results: results.map((r) => ({
      station: { id: r.station.id, name: r.station.name.en, fa: r.station.name.fa },
      distanceKm: r.km,
    })),
  });
}

/**
 * Execute a WebMCP tool by name. Unknown arg shapes and unknown tools are
 * errors, never throws (executors return error results; unexpected exceptions
 * are caught at the boundary so a malformed agent call can't break the page).
 */
export async function executeWebMcpTool(
  name: string,
  args: unknown,
  opts: ClientExecutorOptions = {},
): Promise<WebMCPToolResult> {
  try {
    const record = asRecord(args);
    if (!record) return errorResult("Invalid tool arguments (expected an object).");
    // Unknown extra properties (e.g. a caller-invented day_type) are ignored:
    // the contract has no such inputs and the timetable is derived internally.
    switch (name) {
      case TOOL_GET_ROUTE:
        return executeGetRoute(record, opts);
      case TOOL_LIST_STATIONS:
        return executeListStations(record, opts);
      case TOOL_GET_STATION:
        return executeGetStation(record, opts);
      case TOOL_FIND_NEARBY:
        return executeFindNearby(record, opts);
      default:
        return errorResult(`Unknown tool: '${name}'.`);
    }
  } catch {
    return errorResult("Tool execution failed unexpectedly.");
  }
}
