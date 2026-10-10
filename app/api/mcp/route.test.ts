// Regression: GET /api/mcp must open the SSE stream on a live session
// (200) and return 404 — never 400 — without a valid session id.
// Strict clients (Cursor) mark the whole server failed on a 400 here.
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

describe("GET /api/mcp session handling", () => {
  it("returns 404 (not 400) without a session id", async () => {
    const res = await GET(new Request("http://localhost/api/mcp"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/session/i);
  });

  it("returns 404 for an unknown session id", async () => {
    const res = await GET(
      new Request("http://localhost/api/mcp", {
        headers: { "mcp-session-id": "00000000-0000-0000-0000-000000000000" },
      })
    );
    expect(res.status).toBe(404);
  });

  it("opens the SSE stream (200) on a live session", async () => {
    const sessionId = await initializeSession();
    try {
      const res = await GET(
        new Request("http://localhost/api/mcp", {
          headers: {
            Accept: "text/event-stream",
            "mcp-session-id": sessionId,
          },
        })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
      // Close the stream; the server keeps it open for notifications.
      await res.body?.cancel();
    } finally {
      await DELETE(
        new Request("http://localhost/api/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": sessionId },
        })
      );
    }
  });

  it("still serves tools/list on the session after the fix", async () => {
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
