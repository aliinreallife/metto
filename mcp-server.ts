import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { STATION_MAP } from "./lib/route.js";
import { findRouteWithSchedule } from "./lib/schedule-server.js";
import { nearestStations } from "./lib/geo.js";
import {
  getAllStations,
  getStationLines,
  getStationNeighbors,
} from "./lib/metro/selectors.js";
import { LINES, LINE_COLORS } from "./lib/metro/lines.js";

const METRO_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const server = new McpServer({
  name: "metto-tehran-metro",
  version: "1.0.0",
});

// Tool: Get route between two stations
server.registerTool("get_route", {
  description: "Plan a metro route between two stations. Returns stops, transfers, travel time, and path.",
  annotations: METRO_ANNOTATIONS,
  inputSchema: {
    from: z.string().describe("Origin station ID (stable slug, e.g. 'tajrish'; legacy English names accepted)"),
    to: z.string().describe("Destination station ID (stable slug, e.g. 'tehran-sadeghiyeh'; legacy English names accepted)"),
    depart_at: z.string().optional().describe("ISO-8601 departure datetime with explicit timezone offset or Z (e.g. '2026-09-07T14:00:00+03:30'). Defaults to now."),
  },
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
      content: [{
        type: "text" as const,
        text: `Station not found. Available stations: ${available.join(", ")}`,
      }],
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
        text: `No route found between ${origin.name.fa} (${origin.name.en}) and ${dest.name.fa} (${dest.name.en}).`,
      }],
    };
  }

  const minutes = Math.round(result.route.estimatedSeconds / 60);
  const hops = result.route.hops.map(h => `  ${h.from} → ${h.to} (Line ${h.line})`).join("\n");

  return {
    content: [{
      type: "text" as const,
      text: [
        `Route: ${origin.name.fa} (${origin.name.en}) → ${dest.name.fa} (${dest.name.en})`,
        `Stops: ${result.route.numStops}`,
        `Transfers: ${result.route.numTransfers}`,
        `Travel time: ~${minutes} min`,
        `Path: ${result.route.path.join(" → ")}`,
        `Departure schedule: ${result.scheduleNote}`,
        "",
        "Detailed hops:",
        hops,
      ].join("\n"),
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

// Tool: List all stations
server.registerTool("list_stations", {
  description: "List all metro stations. Optionally filter by line number or search query.",
  annotations: METRO_ANNOTATIONS,
  inputSchema: {
    line: z.number().optional().describe("Filter by line number (1-7)"),
    search: z.string().optional().describe("Search by name (English or Farsi)"),
  },
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

  if (line !== undefined) {
    results = results.filter(s => getStationLines(s.id).includes(line));
  }

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(s => s.name.en.toLowerCase().includes(q) || s.name.fa.includes(search));
  }

  const list = results.map(s => `${s.name.fa} (${s.name.en}) — Lines: ${getStationLines(s.id).join(", ")}`).join("\n");

  return {
    content: [{
      type: "text" as const,
      text: `${results.length} stations found:\n\n${list}`,
    }],
    structuredContent: {
      count: results.length,
      stations: results.map(s => ({
        id: s.id, name: s.name.en, fa: s.name.fa, lines: getStationLines(s.id),
      })),
    },
  };
});

// Tool: Get station details
server.registerTool("get_station", {
  description: "Get full details for a single station including amenities, coordinates, and connections.",
  annotations: METRO_ANNOTATIONS,
  inputSchema: {
    id: z.string().describe("Station ID (stable slug, e.g. 'tajrish'; legacy English names accepted)"),
  },
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
    return {
      content: [{
        type: "text" as const,
        text: `Station '${id}' not found. Available: ${available.join(", ")}`,
      }],
    };
  }

  const amenityList = Object.entries(station.amenities)
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  return {
    content: [{
      type: "text" as const,
      text: [
        `${station.name.fa} (${station.name.en})`,
        `ID: ${station.id}`,
        `Lines: ${getStationLines(station.id).join(", ")}`,
        `Coordinates: ${station.location.lat}, ${station.location.lng}`,
        `Connected to: ${getStationNeighbors(station.id).map(n => n.stationId).join(", ") || "none"}`,
        `Amenities: ${amenityList.join(", ") || "none"}`,
      ].join("\n"),
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

// Tool: Find nearby stations
server.registerTool("find_nearby", {
  description: "Find the closest metro stations to a GPS coordinate.",
  annotations: METRO_ANNOTATIONS,
  inputSchema: {
    lat: z.number().describe("Latitude"),
    lng: z.number().describe("Longitude"),
    limit: z.number().optional().describe("Max results (default 5, max 20)"),
  },
  outputSchema: {
    results: z.array(z.object({
      station: z.object({ id: z.string(), name: z.string(), fa: z.string() }),
      distanceKm: z.number(),
    })),
  },
}, async ({ lat, lng, limit }) => {
  const results = nearestStations(lat, lng, { limit: Math.min(limit ?? 5, 20) });
  const list = results.map(r => `${r.station.name.fa} (${r.station.name.en}) — ${r.km.toFixed(2)} km`).join("\n");

  return {
    content: [{
      type: "text" as const,
      text: `Nearest stations to ${lat}, ${lng}:\n\n${list}`,
    }],
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
  description: "Full list of all Tehran Metro stations",
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
  description: "Metro line information with colors and station counts",
  mimeType: "application/json",
}, async () => {
  const lines = LINES.map(l => {
    const lineStations = getAllStations().filter(s => getStationLines(s.id).includes(l.id));
    return { line: l.id, color: l.color, stationCount: lineStations.length, stations: lineStations.map(s => s.id) };
  });
  return { contents: [{ uri: "metro://lines", mimeType: "application/json", text: JSON.stringify(lines, null, 2) }] };
});

// Prompts

server.registerPrompt("plan-route", {
  description: "Plan a metro route between two stations",
  arguments: [
    { name: "origin", description: "Starting station name", required: true },
    { name: "destination", description: "Ending station name", required: true },
  ],
}, async ({ origin, destination }) => ({
  messages: [{
    role: "user" as const,
    content: { type: "text" as const, text: `Plan a metro route from ${origin} to ${destination}. Use get_route tool.` },
  }],
}));

server.registerPrompt("station-info", {
  description: "Get info about a metro station",
  arguments: [
    { name: "station", description: "Station name", required: true },
  ],
}, async ({ station }) => ({
  messages: [{
    role: "user" as const,
    content: { type: "text" as const, text: `Tell me about ${station} metro station. Use get_station tool.` },
  }],
}));

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Metto MCP Server running on stdio");
}

main().catch(console.error);