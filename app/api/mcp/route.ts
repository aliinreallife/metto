import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { findRoute, STATION_MAP } from "@/lib/route";
import { nearestStations } from "@/lib/geo";
import {
  getAllStations,
  getStationLines,
  getStationNeighbors,
} from "@/lib/metro/selectors";
import { LINES, LINE_COLORS } from "@/lib/metro/lines";

const METRO_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function createServer() {
  const server = new McpServer({
    name: "metto-tehran-metro",
    version: "1.0.0",
  });

  server.registerTool("get_route", {
    description: "Plan a metro route between two stations. Returns stops, transfers, travel time, and path.",
    annotations: METRO_ANNOTATIONS,
    inputSchema: z.object({
      from: z.string().describe("Origin station ID (stable slug, e.g. 'tajrish'; legacy English names accepted)"),
      to: z.string().describe("Destination station ID (stable slug, e.g. 'tehran-sadeghiyeh'; legacy English names accepted)"),
    }),
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
        content: [{ type: "text" as const, text: `Station not found. Available: ${available.join(", ")}` }],
      };
    }

    const result = findRoute(from, to);
    if (!result) {
      return {
        content: [{ type: "text" as const, text: `No route found between ${origin.name.fa} and ${dest.name.fa}.` }],
      };
    }

    const minutes = Math.round(result.estimatedSeconds / 60);
    return {
      content: [{
        type: "text" as const,
        text: [
          `Route: ${origin.name.fa} (${origin.name.en}) → ${dest.name.fa} (${dest.name.en})`,
          `Stops: ${result.numStops}`,
          `Transfers: ${result.numTransfers}`,
          `Travel time: ~${minutes} min`,
          `Path: ${result.path.join(" → ")}`,
        ].join("\n"),
      }],
      structuredContent: {
        route: `${origin.name.fa} (${origin.name.en}) → ${dest.name.fa} (${dest.name.en})`,
        stops: result.numStops,
        transfers: result.numTransfers,
        travelTimeMinutes: minutes,
        path: result.path,
        hops: result.hops.map((h) => ({ from: h.from, to: h.to, line: h.line })),
      },
    };
  });

  server.registerTool("list_stations", {
    description: "List all metro stations. Optionally filter by line number or search query.",
    annotations: METRO_ANNOTATIONS,
    inputSchema: z.object({
      line: z.number().optional().describe("Filter by line number (1-7)"),
      search: z.string().optional().describe("Search by name (English or Farsi)"),
    }),
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
    const list = results.map(s => `${s.name.fa} (${s.name.en}) — Lines: ${getStationLines(s.id).join(", ")}`).join("\n");
    return {
      content: [{ type: "text" as const, text: `${results.length} stations:\n\n${list}` }],
      structuredContent: {
        count: results.length,
        stations: results.map(s => ({
          id: s.id, name: s.name.en, fa: s.name.fa, lines: getStationLines(s.id),
        })),
      },
    };
  });

  server.registerTool("get_station", {
    description: "Get full details for a single station.",
    annotations: METRO_ANNOTATIONS,
    inputSchema: z.object({
      id: z.string().describe("Station ID (stable slug, e.g. 'tajrish'; legacy English names accepted)"),
    }),
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
      return { content: [{ type: "text" as const, text: `Station '${id}' not found. Available: ${available.join(", ")}` }] };
    }
    const amenityList = Object.entries(station.amenities).filter(([, v]) => v).map(([k]) => k);
    return {
      content: [{
        type: "text" as const,
        text: [
          `${station.name.fa} (${station.name.en})`,
          `Lines: ${getStationLines(station.id).join(", ")}`,
          `Coordinates: ${station.location.lat}, ${station.location.lng}`,
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

  server.registerTool("find_nearby", {
    description: "Find the closest metro stations to a GPS coordinate.",
    annotations: METRO_ANNOTATIONS,
    inputSchema: z.object({
      lat: z.number().describe("Latitude"),
      lng: z.number().describe("Longitude"),
      limit: z.number().optional().describe("Max results (default 5, max 20)"),
    }),
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
      content: [{ type: "text" as const, text: `Nearest stations to ${lat}, ${lng}:\n\n${list}` }],
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
    arguments: [
      { name: "origin", description: "Starting station name (English or Farsi)", required: true },
      { name: "destination", description: "Ending station name (English or Farsi)", required: true },
    ],
  }, async ({ origin, destination }) => ({
    messages: [{
      role: "user" as const,
      content: { type: "text" as const, text: `Plan a metro route from ${origin} to ${destination}. Use the get_route tool to find the best path, then summarize the route including number of stops, transfers, and estimated travel time.` },
    }],
  }));

  server.registerPrompt("station-info", {
    description: "Get detailed information about a metro station",
    arguments: [
      { name: "station", description: "Station name (English or Farsi)", required: true },
    ],
  }, async ({ station }) => ({
    messages: [{
      role: "user" as const,
      content: { type: "text" as const, text: `Tell me about ${station} metro station. Use the get_station tool to get details including lines, amenities, coordinates, and connected stations.` },
    }],
  }));

  server.registerPrompt("find-nearest", {
    description: "Find the nearest metro station to a location",
    arguments: [
      { name: "latitude", description: "Latitude coordinate", required: true },
      { name: "longitude", description: "Longitude coordinate", required: true },
    ],
  }, async ({ latitude, longitude }) => ({
    messages: [{
      role: "user" as const,
      content: { type: "text" as const, text: `Find the nearest metro stations to coordinates ${latitude}, ${longitude}. Use the find_nearby tool and list the closest stations with distances.` },
    }],
  }));

  return server;
}

// Store transports by session ID
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

export async function GET(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.set(sessionId, transport);
    },
  });

  const server = createServer();
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function POST(request: Request) {
  const sessionId = request.headers.get("mcp-session-id");
  const existing = sessionId ? transports.get(sessionId) : undefined;

  if (existing) {
    return existing.handleRequest(request);
  }

  // New session
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.set(sessionId, transport);
    },
  });

  const server = createServer();
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function DELETE(request: Request) {
  const sessionId = request.headers.get("mcp-session-id");
  if (sessionId) {
    const transport = transports.get(sessionId);
    if (transport) {
      transports.delete(sessionId);
      await transport.close();
    }
  }
  return new Response(null, { status: 200 });
}
