"use client";

// Progressive-enhancement WebMCP registration. Renders nothing. If the
// browser lacks `document.modelContext`, this is a no-op and Metto works
// exactly as before. Tools execute via client-safe domain functions
// (lib/mcp/client-executors.ts) — no network, offline-capable.

import { useEffect } from "react";
import {
  ALL_TOOL_NAMES,
  METRO_TOOL_ANNOTATIONS,
  TOOL_DESCRIPTIONS,
  TOOL_INPUT_SCHEMAS,
} from "@/lib/mcp/tool-defs";
import { executeWebMcpTool } from "@/lib/mcp/client-executors";
import {
  getModelContext,
  type WebMCPRegistration,
} from "@/lib/mcp/webmcp-types";

// Module-level guard: exactly one registration per tool per page lifetime,
// across React StrictMode remounts. Cleanup on unmount releases the slot.
const registeredTools = new Set<string>();

function release(handle: WebMCPRegistration): void {
  try {
    if (typeof handle === "function") handle();
    else handle?.unregister?.();
  } catch {
    // Registration cleanup is best-effort; the page must never break.
  }
}

export function WebMcpRegistrar(): null {
  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) return;
    const cleanups: Array<() => void> = [];
    for (const name of ALL_TOOL_NAMES) {
      if (registeredTools.has(name)) continue;
      let handle: WebMCPRegistration;
      try {
        handle = modelContext.registerTool({
          name,
          description: TOOL_DESCRIPTIONS[name],
          inputSchema: TOOL_INPUT_SCHEMAS[name] as unknown as Record<string, unknown>,
          annotations: { ...METRO_TOOL_ANNOTATIONS },
          execute: (args, context) =>
            executeWebMcpTool(name, args, { signal: context?.signal }),
        });
      } catch {
        // Unsupported shape or denied registration — skip this tool only.
        continue;
      }
      registeredTools.add(name);
      cleanups.push(() => {
        release(handle);
        registeredTools.delete(name);
      });
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);
  return null;
}
