// Shared MCP/WebMCP tool metadata — client-safe.
//
// Single source of truth for tool names, descriptions, JSON input schemas,
// read-only annotations, departure parsing, and agent-facing message wording.
// Used by the remote MCP servers (HTTP + stdio, via zod mirrors in
// create-server.ts) and by WebMCP (JSON schemas used directly, no zod in the
// browser bundle).
//
// This module MUST stay dependency-free: no node: imports, no MCP SDK, no
// domain imports. Execution differs per runtime (server handlers vs client
// executors); only metadata/validation/wording is shared.

// ---- Tool names (canonical — remote MCP, Smithery, WebMCP all use these) ----

export const TOOL_GET_ROUTE = "get_route";
export const TOOL_LIST_STATIONS = "list_stations";
export const TOOL_GET_STATION = "get_station";
export const TOOL_FIND_NEARBY = "find_nearby";

export const ALL_TOOL_NAMES = [
  TOOL_GET_ROUTE,
  TOOL_LIST_STATIONS,
  TOOL_GET_STATION,
  TOOL_FIND_NEARBY,
] as const;

// ---- Read-only annotations (v1 tools are non-consequential) ----

export const METRO_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

// ---- Descriptions ----

export const GET_ROUTE_DESCRIPTION =
  "Plan a metro route between two stations. Returns stops, transfers, travel time, and path. " +
  "Departure is an absolute instant: Metto automatically derives the correct Tehran (Asia/Tehran) " +
  "weekday, Thursday, or Friday/official-holiday timetable from it — never pass a day type.";

export const LIST_STATIONS_DESCRIPTION =
  "List all metro stations. Optionally filter by line number or search query.";

export const GET_STATION_DESCRIPTION =
  "Get full details for a single station.";

export const FIND_NEARBY_DESCRIPTION =
  "Find the closest metro stations to a GPS coordinate.";

// ---- Property descriptions (shared by zod mirrors + JSON schemas) ----

export const FROM_DESCRIPTION =
  "Origin station ID (stable slug, e.g. 'tajrish'; legacy English names accepted)";

export const TO_DESCRIPTION =
  "Destination station ID (stable slug, e.g. 'tehran-sadeghiyeh'; legacy English names accepted)";

export const DEPART_AT_DESCRIPTION =
  "ISO-8601 departure datetime with explicit timezone offset or Z " +
  "(e.g. '2026-09-07T14:00:00+03:30'). Defaults to now. " +
  "Metto derives the Tehran weekday/Thursday/Friday-or-official-holiday timetable " +
  "automatically from this instant.";

export const LINE_FILTER_DESCRIPTION = "Filter by line number (1-7)";

export const SEARCH_DESCRIPTION = "Search by name (English or Farsi)";

export const STATION_ID_DESCRIPTION =
  "Station ID (stable slug, e.g. 'tajrish'; legacy English names accepted)";

export const LAT_DESCRIPTION = "Latitude";

export const LNG_DESCRIPTION = "Longitude";

export const LIMIT_DESCRIPTION = "Max results (default 5, max 20)";

// ---- JSON input schemas (WebMCP uses these directly) ----

export type JsonInputSchema = {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  required: readonly string[];
  additionalProperties: false;
};

export const GET_ROUTE_INPUT_SCHEMA: JsonInputSchema = {
  type: "object",
  properties: {
    from: { type: "string", description: FROM_DESCRIPTION },
    to: { type: "string", description: TO_DESCRIPTION },
    depart_at: { type: "string", description: DEPART_AT_DESCRIPTION },
  },
  required: ["from", "to"],
  additionalProperties: false,
};

export const LIST_STATIONS_INPUT_SCHEMA: JsonInputSchema = {
  type: "object",
  properties: {
    line: { type: "number", description: LINE_FILTER_DESCRIPTION },
    search: { type: "string", description: SEARCH_DESCRIPTION },
  },
  required: [],
  additionalProperties: false,
};

export const GET_STATION_INPUT_SCHEMA: JsonInputSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: STATION_ID_DESCRIPTION },
  },
  required: ["id"],
  additionalProperties: false,
};

export const FIND_NEARBY_INPUT_SCHEMA: JsonInputSchema = {
  type: "object",
  properties: {
    lat: { type: "number", description: LAT_DESCRIPTION },
    lng: { type: "number", description: LNG_DESCRIPTION },
    limit: { type: "number", description: LIMIT_DESCRIPTION },
  },
  required: ["lat", "lng"],
  additionalProperties: false,
};

export const TOOL_INPUT_SCHEMAS: Record<string, JsonInputSchema> = {
  [TOOL_GET_ROUTE]: GET_ROUTE_INPUT_SCHEMA,
  [TOOL_LIST_STATIONS]: LIST_STATIONS_INPUT_SCHEMA,
  [TOOL_GET_STATION]: GET_STATION_INPUT_SCHEMA,
  [TOOL_FIND_NEARBY]: FIND_NEARBY_INPUT_SCHEMA,
};

export const TOOL_DESCRIPTIONS: Record<string, string> = {
  [TOOL_GET_ROUTE]: GET_ROUTE_DESCRIPTION,
  [TOOL_LIST_STATIONS]: LIST_STATIONS_DESCRIPTION,
  [TOOL_GET_STATION]: GET_STATION_DESCRIPTION,
  [TOOL_FIND_NEARBY]: FIND_NEARBY_DESCRIPTION,
};

// ---- Departure parsing (moved here from schedule-server.ts, unchanged) ----

// ISO-8601 datetime with an EXPLICIT timezone (Z or ±hh:mm / ±hhmm).
// Naive timestamps (no offset) are ambiguous and rejected.
const ISO_WITH_TZ =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})$/;

/**
 * Parse a depart_at/departAt parameter. Returns null for anything that is
 * not ISO-8601 with an explicit timezone offset or Z (e.g. "2026-09-07T14:00:00"
 * is rejected). Callers map null to isError (MCP/WebMCP) or HTTP 400 (REST).
 */
export function parseDepartAtParam(value: string): Date | null {
  if (!ISO_WITH_TZ.test(value.trim())) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ---- Shared agent-facing wording ----

export const INVALID_DEPART_AT_ERROR =
  "Invalid depart_at (expected ISO-8601 datetime with explicit timezone offset or Z, e.g. 2026-09-07T14:00:00+03:30)";

export function stationListNotFoundText(available: string[]): string {
  return `Station not found. Available: ${available.join(", ")}`;
}

export function stationNotFoundText(id: string, available: string[]): string {
  return `Station '${id}' not found. Available: ${available.join(", ")}`;
}

export function formatRouteSummary(args: {
  originFa: string;
  originEn: string;
  destFa: string;
  destEn: string;
  stops: number;
  transfers: number;
  travelTimeMinutes: number;
  path: string[];
  scheduleNote: string;
}): string {
  return [
    `Route: ${args.originFa} (${args.originEn}) → ${args.destFa} (${args.destEn})`,
    `Stops: ${args.stops}`,
    `Transfers: ${args.transfers}`,
    `Travel time: ~${args.travelTimeMinutes} min`,
    `Path: ${args.path.join(" → ")}`,
    `Departure schedule: ${args.scheduleNote}`,
  ].join("\n");
}

export function formatNoRouteText(
  originFa: string,
  originEn: string,
  destFa: string,
  destEn: string,
): string {
  return `No route found between ${originFa} (${originEn}) and ${destFa} (${destEn}).`;
}

export function formatStationText(args: {
  fa: string;
  en: string;
  lines: number[];
  lat: number;
  lng: number;
  amenities: string[];
}): string {
  return [
    `${args.fa} (${args.en})`,
    `Lines: ${args.lines.join(", ")}`,
    `Coordinates: ${args.lat}, ${args.lng}`,
    `Amenities: ${args.amenities.join(", ") || "none"}`,
  ].join("\n");
}

export function formatStationListText(
  count: number,
  lines: string[],
): string {
  return `${count} stations:\n\n${lines.join("\n")}`;
}

export function formatNearbyText(
  lat: number,
  lng: number,
  lines: string[],
): string {
  return `Nearest stations to ${lat}, ${lng}:\n\n${lines.join("\n")}`;
}

// ---- Canonical agent handoff URLs (existing app conventions) ----

/** Shareable route URL — mirrors the web UI (`/?from=&to=`). No departAt: the app has no time-in-URL convention. */
export function buildCanonicalRouteUrl(from: string, to: string): string {
  const params = new URLSearchParams({ from, to });
  return `https://metto.ir/?${params.toString()}`;
}
