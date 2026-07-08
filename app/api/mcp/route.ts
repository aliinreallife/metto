import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { findRoute, STATION_MAP } from "@/lib/route";
import { nearestStations } from "@/lib/geo";
import { STATIONS } from "@/lib/metro-data";

function createServer() {
  const server = new McpServer({
    name: "metto-tehran-metro",
    version: "1.0.0",
  });

  server.registerTool("get_route", {
    description: "Plan a metro route between two stations. Returns stops, transfers, travel time, and path.",
    inputSchema: z.object({
      from: z.string().describe("Origin station ID (English name, e.g. 'Tajrish')"),
      to: z.string().describe("Destination station ID (English name, e.g. 'Darvazeh Sharq')"),
    }),
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
        content: [{ type: "text" as const, text: `No route found between ${origin.fa} and ${dest.fa}.` }],
      };
    }

    const minutes = Math.round(result.estimatedSeconds / 60);
    return {
      content: [{
        type: "text" as const,
        text: [
          `Route: ${origin.fa} (${origin.name}) → ${dest.fa} (${dest.name})`,
          `Stops: ${result.numStops}`,
          `Transfers: ${result.numTransfers}`,
          `Travel time: ~${minutes} min`,
          `Path: ${result.path.join(" → ")}`,
        ].join("\n"),
      }],
    };
  });

  server.registerTool("list_stations", {
    description: "List all metro stations. Optionally filter by line number or search query.",
    inputSchema: z.object({
      line: z.number().optional().describe("Filter by line number (1-7)"),
      search: z.string().optional().describe("Search by name (English or Farsi)"),
    }),
  }, async ({ line, search }) => {
    let results = STATIONS;
    if (line !== undefined) results = results.filter(s => s.lines.includes(line));
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(s => s.name.toLowerCase().includes(q) || s.fa.includes(search));
    }
    const list = results.map(s => `${s.fa} (${s.name}) — Lines: ${s.lines.join(", ")}`).join("\n");
    return { content: [{ type: "text" as const, text: `${results.length} stations:\n\n${list}` }] };
  });

  server.registerTool("get_station", {
    description: "Get full details for a single station.",
    inputSchema: z.object({
      id: z.string().describe("Station ID (English name, e.g. 'Tajrish')"),
    }),
  }, async ({ id }) => {
    const station = STATION_MAP.get(id);
    if (!station) {
      const available = Array.from(STATION_MAP.keys()).slice(0, 30);
      return { content: [{ type: "text" as const, text: `Station '${id}' not found. Available: ${available.join(", ")}` }] };
    }
    const amenities = Object.entries(station.amenities).filter(([, v]) => v).map(([k]) => k).join(", ") || "none";
    return {
      content: [{
        type: "text" as const,
        text: [
          `${station.fa} (${station.name})`,
          `Lines: ${station.lines.join(", ")}`,
          `Coordinates: ${station.lat}, ${station.lng}`,
          `Amenities: ${amenities}`,
        ].join("\n"),
      }],
    };
  });

  server.registerTool("find_nearby", {
    description: "Find the closest metro stations to a GPS coordinate.",
    inputSchema: z.object({
      lat: z.number().describe("Latitude"),
      lng: z.number().describe("Longitude"),
      limit: z.number().optional().describe("Max results (default 5, max 20)"),
    }),
  }, async ({ lat, lng, limit }) => {
    const results = nearestStations(lat, lng, { limit: Math.min(limit ?? 5, 20) });
    const list = results.map(r => `${r.station.fa} (${r.station.name}) — ${r.km.toFixed(2)} km`).join("\n");
    return { content: [{ type: "text" as const, text: `Nearest stations to ${lat}, ${lng}:\n\n${list}` }] };
  });

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
