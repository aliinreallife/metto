// GET /api/mcp must decline standalone SSE streams with 405 — never 400
// and never a hanging stream. The SDK client treats 405 as "no stream,
// continue over POST"; anything else marks the server failed (Cursor).
// This stack only delivers a response once its stream closes, so offering
// a never-ending stream would hang instead of connecting.
import { describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "./route";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

function postRpc(body: unknown, sessionId?: string) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: sessionId
      ? { ...MCP_HEADERS, "mcp-session-id": sessionId }
      : MCP_HEADERS,
    body: JSON.stringify(body),
  });
}

async function initializeSession(): Promise<string> {
  const res = await POST(
    postRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "route-test", version: "0.0.0" },
      },
    })
  );
  expect(res.status).toBe(200);
  const sessionId = res.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();
  // Drain the SSE body so the handler settles.
  await res.text();
  return sessionId as string;
}

describe("GET /api/mcp declines standalone streams with 405", () => {
  it("returns 405 (not 400) without a session id", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/SSE streams are not supported/);
  });

  it("returns 405 for an unknown session id", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });

  it("returns 405 immediately (no hang) on a live session", async () => {
    const sessionId = await initializeSession();
    try {
      const res = await GET();
      expect(res.status).toBe(405);
    } finally {
      await DELETE(
        new Request("http://localhost/api/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": sessionId },
        })
      );
    }
  });

  it("still serves tools/list on the session over POST", async () => {
    const sessionId = await initializeSession();
    try {
      const res = await POST(
        postRpc(
          { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
          sessionId
        )
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toMatch(/list_stations/);
      expect(text).toMatch(/get_route/);
    } finally {
      await DELETE(
        new Request("http://localhost/api/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": sessionId },
        })
      );
    }
  });
});
