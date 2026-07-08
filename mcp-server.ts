import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findRoute, STATION_MAP } from "./lib/route.js";
import { nearestStations } from "./lib/geo.js";
import { STATIONS, LINE_COLORS } from "./lib/metro-data.js";

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
    from: z.string().describe("Origin station ID (English name, e.g. 'Tajrish')"),
    to: z.string().describe("Destination station ID (English name, e.g. 'Darvazeh Sharq')"),
  },
  outputSchema: {
    route: z.string(),
    stops: z.number(),
    transfers: z.number(),
    travelTimeMinutes: z.number(),
    path: z.array(z.string()),
    hops: z.array(z.object({ from: z.string(), to: z.string(), line: z.number() })),
  },
}, async ({ from, to }) => {
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

  const result = findRoute(from, to);
  if (!result) {
    return {
      content: [{
        type: "text" as const,
        text: `No route found between ${origin.fa} (${origin.name}) and ${dest.fa} (${dest.name}).`,
      }],
    };
  }

  const minutes = Math.round(result.estimatedSeconds / 60);
  const hops = result.hops.map(h => `  ${h.from} → ${h.to} (Line ${h.line})`).join("\n");

  return {
    content: [{
      type: "text" as const,
      text: [
        `Route: ${origin.fa} (${origin.name}) → ${dest.fa} (${dest.name})`,
        `Stops: ${result.numStops}`,
        `Transfers: ${result.numTransfers}`,
        `Travel time: ~${minutes} min`,
        `Path: ${result.path.join(" → ")}`,
        "",
        "Detailed hops:",
        hops,
      ].join("\n"),
    }],
    structuredContent: {
      route: `${origin.fa} (${origin.name}) → ${dest.fa} (${dest.name})`,
      stops: result.numStops,
      transfers: result.numTransfers,
      travelTimeMinutes: minutes,
      path: result.path,
      hops: result.hops,
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
  let results = STATIONS;

  if (line !== undefined) {
    results = results.filter(s => s.lines.includes(line));
  }

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(s => s.name.toLowerCase().includes(q) || s.fa.includes(search));
  }

  const list = results.map(s => `${s.fa} (${s.name}) — Lines: ${s.lines.join(", ")}`).join("\n");

  return {
    content: [{
      type: "text" as const,
      text: `${results.length} stations found:\n\n${list}`,
    }],
    structuredContent: {
      count: results.length,
      stations: results.map(s => ({
        id: s.id, name: s.name, fa: s.fa, lines: s.lines,
      })),
    },
  };
});

// Tool: Get station details
server.registerTool("get_station", {
  description: "Get full details for a single station including amenities, coordinates, and connections.",
  annotations: METRO_ANNOTATIONS,
  inputSchema: {
    id: z.string().describe("Station ID (English name, e.g. 'Tajrish')"),
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
    .filter(([, v]) => v)
    .map(([k]) => k);

  return {
    content: [{
      type: "text" as const,
      text: [
        `${station.fa} (${station.name})`,
        `ID: ${station.id}`,
        `Lines: ${station.lines.join(", ")}`,
        `Coordinates: ${station.lat}, ${station.lng}`,
        `Connected to: ${station.relations.join(", ") || "none"}`,
        `Amenities: ${amenityList.join(", ") || "none"}`,
      ].join("\n"),
    }],
    structuredContent: {
      id: station.id,
      name: station.name,
      fa: station.fa,
      lines: station.lines,
      coordinates: { lat: station.lat, lng: station.lng },
      connectedTo: station.relations,
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
  const list = results.map(r => `${r.station.fa} (${r.station.name}) — ${r.km.toFixed(2)} km`).join("\n");

  return {
    content: [{
      type: "text" as const,
      text: `Nearest stations to ${lat}, ${lng}:\n\n${list}`,
    }],
    structuredContent: {
      results: results.map(r => ({
        station: { id: r.station.id, name: r.station.name, fa: r.station.fa },
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
    text: JSON.stringify(STATIONS.map(s => ({
      id: s.id, name: s.name, fa: s.fa, lines: s.lines,
      lat: s.lat, lng: s.lng, amenities: s.amenities,
    })), null, 2),
  }],
}));

server.registerResource("lines", "metro://lines", {
  description: "Metro line information with colors and station counts",
  mimeType: "application/json",
}, async () => {
  const lines = Object.keys(LINE_COLORS).map(Number).sort((a, b) => a - b).map(lineNum => {
    const lineStations = STATIONS.filter(s => s.lines.includes(lineNum));
    return { line: lineNum, color: LINE_COLORS[lineNum], stationCount: lineStations.length, stations: lineStations.map(s => s.id) };
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