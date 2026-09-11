import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMettoMcpServer } from "./lib/mcp/create-server.js";

// Single shared implementation (tools, resources, prompts) lives in
// lib/mcp/create-server.ts and is also used by the HTTP server
// (app/api/mcp/route.ts, canonical endpoint /mcp).

// Start the server
async function main() {
  const server = createMettoMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Metto MCP Server running on stdio");
}

main().catch(console.error);
