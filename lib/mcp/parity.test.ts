// Parity: the single shared server implementation exposes exactly the
// canonical tools with the shared metadata, and the zod mirrors never drift
// from the JSON-schema source of truth in tool-defs.ts (which WebMCP uses
// directly). No caller-supplied day-type classification may exist.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ALL_TOOL_NAMES,
  METRO_TOOL_ANNOTATIONS,
  TOOL_DESCRIPTIONS,
  TOOL_INPUT_SCHEMAS,
} from "./tool-defs";
import {
  MCP_ZOD_INPUT_SCHEMAS,
  createMettoMcpServer,
} from "./create-server";

async function listLiveTools() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMettoMcpServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "parity-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    return await client.listTools();
  } finally {
    await client.close();
  }
}

describe("shared MCP server parity", () => {
  it("exposes exactly the four canonical tools", async () => {
    const { tools } = await listLiveTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("uses the shared descriptions and read-only annotations", async () => {
    const { tools } = await listLiveTools();
    for (const tool of tools) {
      expect(tool.description).toBe(TOOL_DESCRIPTIONS[tool.name]);
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.annotations?.idempotentHint).toBe(true);
      expect(tool.annotations).toMatchObject({ ...METRO_TOOL_ANNOTATIONS });
    }
  });

  it("get_route exposes depart_at (optional ISO instant), from/to required", async () => {
    const { tools } = await listLiveTools();
    const route = tools.find((t) => t.name === "get_route");
    expect(route).toBeDefined();
    const schema = route!.inputSchema as {
      required?: string[];
      properties?: Record<string, { description?: string }>;
    };
    expect(schema.required?.sort()).toEqual(["from", "to"]);
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
      "depart_at",
      "from",
      "to",
    ]);
    expect(schema.properties?.depart_at?.description).toContain("ISO-8601");
    expect(schema.properties?.depart_at?.description).toContain("Tehran");
  });

  it("exposes no caller-supplied day-type classification on any tool", async () => {
    const { tools } = await listLiveTools();
    for (const tool of tools) {
      const props = Object.keys(
        (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
      );
      for (const name of props) {
        expect(name).not.toMatch(/day.?type|weekday|is.?holiday|is.?friday|schedule.?type/i);
      }
    }
  });

  it("zod mirrors match the shared JSON schemas (names, required, descriptions)", () => {
    for (const name of ALL_TOOL_NAMES) {
      const json = TOOL_INPUT_SCHEMAS[name];
      const jsonSchema = z.toJSONSchema(MCP_ZOD_INPUT_SCHEMAS[name]) as {
        properties?: Record<string, { description?: string }>;
        required?: string[];
      };
      expect(Object.keys(jsonSchema.properties ?? {}).sort()).toEqual(
        Object.keys(json.properties).sort(),
      );
      expect([...(jsonSchema.required ?? [])].sort()).toEqual([...json.required].sort());
      for (const [prop, def] of Object.entries(json.properties)) {
        expect(jsonSchema.properties?.[prop]?.description).toBe(def.description);
      }
    }
  });
});
