import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMettoMcpServer } from "@/lib/mcp/create-server";

// Single shared implementation (tools, resources, prompts) lives in
// lib/mcp/create-server.ts and is also used by the stdio server
// (mcp-server.ts). Tool metadata sources from lib/mcp/tool-defs.ts.

// Store transports by session ID
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

export async function GET(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.set(sessionId, transport);
    },
  });

  const server = createMettoMcpServer();
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

  const server = createMettoMcpServer();
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
