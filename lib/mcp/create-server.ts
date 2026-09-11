// Shared remote-MCP server implementation (HTTP + stdio).
//
// Server-only: imports node:fs/Redis-backed schedule wiring via
// schedule-server.ts. MUST NOT be imported by client components — WebMCP has
// its own client-safe executors (client-executors.ts) over the same
// tool-defs.ts metadata.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { STATION_MAP } from "../route";
import { findRouteWithSchedule } from "../schedule-server";
import { nearestStations } from "../geo";
import {
  getAllStations,
  getStationLines,
  getStationNeighbors,
} from "../metro/selectors";
import { LINES } from "../metro/lines";
import {
  DEPART_AT_DESCRIPTION,
  FIND_NEARBY_DESCRIPTION,
  FROM_DESCRIPTION,
  GET_ROUTE_DESCRIPTION,
  GET_STATION_DESCRIPTION,
  LAT_DESCRIPTION,
  LIMIT_DESCRIPTION,
  LINE_FILTER_DESCRIPTION,
  LIST_STATIONS_DESCRIPTION,
  LNG_DESCRIPTION,
  METRO_TOOL_ANNOTATIONS,
  SEARCH_DESCRIPTION,
  STATION_ID_DESCRIPTION,
  TO_DESCRIPTION,
  TOOL_DESCRIPTIONS,
  TOOL_FIND_NEARBY,
  TOOL_GET_ROUTE,
  TOOL_GET_STATION,
  TOOL_INPUT_SCHEMAS,
  TOOL_LIST_STATIONS,
  formatNearbyText,
  formatNoRouteText,
  formatRouteSummary,
  formatStationListText,
  formatStationText,
  stationListNotFoundText,
  stationNotFoundText,
} from "./tool-defs";

// Zod mirrors of the shared JSON input schemas. Descriptions are pulled from
// tool-defs.ts; parity.test.ts asserts the mirrors never drift from the JSON
// source of truth (property names, required sets, descriptions).
// All four are .strict(): unknown properties are rejected, matching the
// shared schemas' additionalProperties:false (Zod's default would strip).
export const GET_ROUTE_ZOD_SCHEMA = z.object({
  from: z.string().describe(FROM_DESCRIPTION),
  to: z.string().describe(TO_DESCRIPTION),
  depart_at: z.string().optional().describe(DEPART_AT_DESCRIPTION),
}).strict();

export const LIST_STATIONS_ZOD_SCHEMA = z.object({
  line: z.number().optional().describe(LINE_FILTER_DESCRIPTION),
  search: z.string().optional().describe(SEARCH_DESCRIPTION),
}).strict();

export const GET_STATION_ZOD_SCHEMA = z.object({
  id: z.string().describe(STATION_ID_DESCRIPTION),
}).strict();

export const FIND_NEARBY_ZOD_SCHEMA = z.object({
  lat: z.number().describe(LAT_DESCRIPTION),
  lng: z.number().describe(LNG_DESCRIPTION),
  limit: z.number().optional().describe(LIMIT_DESCRIPTION),
}).strict();

export const MCP_ZOD_INPUT_SCHEMAS = {
  [TOOL_GET_ROUTE]: GET_ROUTE_ZOD_SCHEMA,
  [TOOL_LIST_STATIONS]: LIST_STATIONS_ZOD_SCHEMA,
  [TOOL_GET_STATION]: GET_STATION_ZOD_SCHEMA,
  [TOOL_FIND_NEARBY]: FIND_NEARBY_ZOD_SCHEMA,
} as const;

// Re-export the shared JSON-schema source of truth alongside the zod mirrors
// so tests and WebMCP-adjacent tooling have one import site. (Server code
// paths below use the zod mirrors; the JSON schemas are the contract.)
export { TOOL_DESCRIPTIONS, TOOL_INPUT_SCHEMAS };

export function createMettoMcpServer(): McpServer {
  const server = new McpServer({
    name: "metto-tehran-metro",
    version: "1.0.0",
  });

  server.registerTool(TOOL_GET_ROUTE, {
    description: GET_ROUTE_DESCRIPTION,
    annotations: METRO_TOOL_ANNOTATIONS,
    inputSchema: GET_ROUTE_ZOD_SCHEMA,
    outputSchema: {
      route: z.string(),
      stops: z.number(),
      transfers: z.number(),
      travelTimeMinutes: z.number(),
      path: z.array(z.string()),
      hops: z.array(z.object({ from: z.string(), to: z.string(), line: z.number() })),
    },
  }, async ({ from, to, depart_at }) => {
    const origin = STATION_MAP.get(from);
    const dest = STATION_MAP.get(to);

    if (!origin || !dest) {
      const available = Array.from(STATION_MAP.keys()).slice(0, 30);
      return {
        content: [{ type: "text" as const, text: stationListNotFoundText(available) }],
      };
    }

    const result = await findRouteWithSchedule(from, to, depart_at);
    if (!result || !result.ok) {
      if (result && !result.ok) {
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: result.error }],
        };
      }
      return {
        content: [{
          type: "text" as const,
          text: formatNoRouteText(origin.name.fa, origin.name.en, dest.name.fa, dest.name.en),
        }],
      };
    }

    const minutes = Math.round(result.route.estimatedSeconds / 60);
    return {
      content: [{
        type: "text" as const,
        text: formatRouteSummary({
          originFa: origin.name.fa,
          originEn: origin.name.en,
          destFa: dest.name.fa,
          destEn: dest.name.en,
          stops: result.route.numStops,
          transfers: result.route.numTransfers,
          travelTimeMinutes: minutes,
          path: result.route.path,
          scheduleNote: result.scheduleNote,
        }),
      }],
      structuredContent: {
        route: `${origin.name.fa} (${origin.name.en}) → ${dest.name.fa} (${dest.name.en})`,
        stops: result.route.numStops,
        transfers: result.route.numTransfers,
        travelTimeMinutes: minutes,
        path: result.route.path,
        hops: result.route.hops.map((h) => ({ from: h.from, to: h.to, line: h.line })),
      },
    };
  });

  server.registerTool(TOOL_LIST_STATIONS, {
    description: LIST_STATIONS_DESCRIPTION,
    annotations: METRO_TOOL_ANNOTATIONS,
    inputSchema: LIST_STATIONS_ZOD_SCHEMA,
    outputSchema: {
      count: z.number(),
      stations: z.array(z.object({
        id: z.string(),
        name: z.string(),
        fa: z.string(),
        lines: z.array(z.number()),
      })),
    },
  }, async ({ line, search }) => {
    let results = getAllStations();
    if (line !== undefined) results = results.filter(s => getStationLines(s.id).includes(line));
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(s => s.name.en.toLowerCase().includes(q) || s.name.fa.includes(search));
    }
    const list = results.map(s => `${s.name.fa} (${s.name.en}) — Lines: ${getStationLines(s.id).join(", ")}`);
    return {
      content: [{ type: "text" as const, text: formatStationListText(results.length, list) }],
      structuredContent: {
        count: results.length,
        stations: results.map(s => ({
          id: s.id, name: s.name.en, fa: s.name.fa, lines: getStationLines(s.id),
        })),
      },
    };
  });

  server.registerTool(TOOL_GET_STATION, {
    description: GET_STATION_DESCRIPTION,
    annotations: METRO_TOOL_ANNOTATIONS,
    inputSchema: GET_STATION_ZOD_SCHEMA,
    outputSchema: {
      id: z.string(),
      name: z.string(),
      fa: z.string(),
      lines: z.array(z.number()),
      coordinates: z.object({ lat: z.number(), lng: z.number() }),
      connectedTo: z.array(z.string()),
      amenities: z.array(z.string()),
    },
  }, async ({ id }) => {
    const station = STATION_MAP.get(id);
    if (!station) {
      const available = Array.from(STATION_MAP.keys()).slice(0, 30);
      return { content: [{ type: "text" as const, text: stationNotFoundText(id, available) }] };
    }
    const amenityList = Object.entries(station.amenities).filter(([, v]) => v === true).map(([k]) => k);
    return {
      content: [{
        type: "text" as const,
        text: formatStationText({
          fa: station.name.fa,
          en: station.name.en,
          lines: getStationLines(station.id),
          lat: station.location.lat,
          lng: station.location.lng,
          amenities: amenityList,
        }),
      }],
      structuredContent: {
        id: station.id,
        name: station.name.en,
        fa: station.name.fa,
        lines: getStationLines(station.id),
        coordinates: { lat: station.location.lat, lng: station.location.lng },
        connectedTo: getStationNeighbors(station.id).map(n => n.stationId),
        amenities: amenityList,
      },
    };
  });

  server.registerTool(TOOL_FIND_NEARBY, {
    description: FIND_NEARBY_DESCRIPTION,
    annotations: METRO_TOOL_ANNOTATIONS,
    inputSchema: FIND_NEARBY_ZOD_SCHEMA,
    outputSchema: {
      results: z.array(z.object({
        station: z.object({ id: z.string(), name: z.string(), fa: z.string() }),
        distanceKm: z.number(),
      })),
    },
  }, async ({ lat, lng, limit }) => {
    const results = nearestStations(lat, lng, { limit: Math.min(limit ?? 5, 20) });
    const list = results.map(r => `${r.station.name.fa} (${r.station.name.en}) — ${r.km.toFixed(2)} km`);
    return {
      content: [{ type: "text" as const, text: formatNearbyText(lat, lng, list) }],
      structuredContent: {
        results: results.map(r => ({
          station: { id: r.station.id, name: r.station.name.en, fa: r.station.name.fa },
          distanceKm: r.km,
        })),
      },
    };
  });

  // Resources

  server.registerResource("stations", "metro://stations", {
    description: "Full list of all Tehran Metro stations with names, lines, coordinates, and amenities",
    mimeType: "application/json",
  }, async () => ({
    contents: [{
      uri: "metro://stations",
      mimeType: "application/json",
      text: JSON.stringify(getAllStations().map(s => ({
        id: s.id, name: s.name.en, fa: s.name.fa, lines: getStationLines(s.id),
        lat: s.location.lat, lng: s.location.lng, status: s.status, amenities: s.amenities,
      })), null, 2),
    }],
  }));

  server.registerResource("lines", "metro://lines", {
    description: "Tehran Metro line information with colors and station counts",
    mimeType: "application/json",
  }, async () => {
    const lines = LINES.map(l => {
      const lineStations = getAllStations().filter(s => getStationLines(s.id).includes(l.id));
      return {
        line: l.id,
        color: l.color,
        stationCount: lineStations.length,
        stations: lineStations.map(s => s.id),
      };
    });
    return {
      contents: [{
        uri: "metro://lines",
        mimeType: "application/json",
        text: JSON.stringify(lines, null, 2),
      }],
    };
  });

  server.registerResource("station", "metro://station/{id}", {
    description: "Details for a specific station by ID",
    mimeType: "application/json",
  }, async (uri) => {
    const id = uri.searchParams.get("id") ?? uri.pathname.split("/").pop() ?? "";
    const station = STATION_MAP.get(id);
    if (!station) {
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ error: "Station not found" }) }] };
    }
    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          id: station.id, name: station.name.en, fa: station.name.fa,
          lines: getStationLines(station.id), lat: station.location.lat, lng: station.location.lng,
          status: station.status,
          neighbors: getStationNeighbors(station.id), amenities: station.amenities,
        }, null, 2),
      }],
    };
  });

  // Prompts

  server.registerPrompt("plan-route", {
    description: "Plan a metro route between two stations",
    argsSchema: {
      origin: z.string().describe("Starting station name (English or Farsi)"),
      destination: z.string().describe("Ending station name (English or Farsi)"),
    },
  }, async ({ origin, destination }) => ({
    messages: [{
      role: "user" as const,
      content: { type: "text" as const, text: `Plan a metro route from ${origin} to ${destination}. Use the get_route tool to find the best path, then summarize the route including number of stops, transfers, and estimated travel time.` },
    }],
  }));

  server.registerPrompt("station-info", {
    description: "Get detailed information about a metro station",
    argsSchema: {
      station: z.string().describe("Station name (English or Farsi)"),
    },
  }, async ({ station }) => ({
    messages: [{
      role: "user" as const,
      content: { type: "text" as const, text: `Tell me about ${station} metro station. Use the get_station tool to get details including lines, amenities, coordinates, and connected stations.` },
    }],
  }));

  server.registerPrompt("find-nearest", {
    description: "Find the nearest metro station to a location",
    argsSchema: {
      latitude: z.string().describe("Latitude coordinate"),
      longitude: z.string().describe("Longitude coordinate"),
    },
  }, async ({ latitude, longitude }) => ({
    messages: [{
      role: "user" as const,
      content: { type: "text" as const, text: `Find the nearest metro stations to coordinates ${latitude}, ${longitude}. Use the find_nearby tool and list the closest stations with distances.` },
    }],
  }));

  return server;
}
