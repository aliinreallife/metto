// Minimal WebMCP browser typings.
//
// WebMCP is experimental and not yet in TypeScript's DOM lib, so this is the
// smallest local declaration needed. Shapes below follow the documented
// `document.modelContext.registerTool` draft API; if the spec changes, only
// this file and components/web-mcp.tsx need updating. Everything degrades to
// a no-op when `document.modelContext` is absent.

export type WebMCPContentItem = { type: "text"; text: string };

export type WebMCPToolResult = {
  content: WebMCPContentItem[];
  structuredContent?: unknown;
  isError?: boolean;
};

export type WebMCPExecuteContext = {
  signal?: AbortSignal;
};

export type WebMCPToolDefinition = {
  name: string;
  description?: string;
  /** Plain JSON Schema (NOT zod) — from lib/mcp/tool-defs.ts. */
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  execute: (
    args: unknown,
    context?: WebMCPExecuteContext,
  ) => Promise<WebMCPToolResult>;
};

export type WebMCPRegistration =
  | { unregister?: () => void }
  | (() => void)
  | void;

export type ModelContext = {
  registerTool: (tool: WebMCPToolDefinition) => WebMCPRegistration;
};

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

/** Feature detection: null when WebMCP is unsupported (progressive enhancement). */
export function getModelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;
  return document.modelContext ?? null;
}
