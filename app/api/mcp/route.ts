import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMettoMcpServer } from "@/lib/mcp/create-server";

// Single shared implementation (tools, resources, prompts) lives in
// lib/mcp/create-server.ts and is also used by the stdio server
// (mcp-server.ts). Tool metadata sources from lib/mcp/tool-defs.ts.

// Store transports by session ID
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

// MCP handlers must never be statically optimized: every method depends on
// request headers/body (session id, JSON-RPC payload) and GET returns a
// never-ending stream. Without this, Next.js may buffer the SSE stream
// until it closes instead of flushing it progressively.
export const dynamic = "force-dynamic";

export async function GET() {
  // Standalone SSE streams are intentionally not offered: this stack only
  // delivers a response once its stream closes, so a never-ending stream
  // would hang instead of connecting. Per the MCP spec, 405 tells clients
  // to continue in plain request/response mode over POST (which is how
  // opencode already works); a 400 here makes strict clients (Cursor) mark
  // the whole server failed.
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Method not allowed: standalone SSE streams are not supported, use POST",
      },
      id: null,
    }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST, DELETE" },
    }
  );
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
