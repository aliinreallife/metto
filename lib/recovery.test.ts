import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDocumentCaches,
  consumeChunkAutoRetry,
  isChunkLoadError,
} from "./recovery";

describe("isChunkLoadError", () => {
  it("matches Next.js stale-chunk failure shapes", () => {
    expect(isChunkLoadError("Loading chunk 123 failed")).toBe(true);
    expect(isChunkLoadError("ChunkLoadError: Loading chunk app/map/page failed")).toBe(true);
    expect(
      isChunkLoadError(
        "Failed to fetch dynamically imported module: https://metto.ir/_next/static/chunks/abc.js",
      ),
    ).toBe(true);
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
  });

  it("rejects ordinary errors and non-strings", () => {
    expect(isChunkLoadError("TypeError: Cannot read properties of null")).toBe(false);
    expect(isChunkLoadError("")).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(new Error("Loading chunk 1 failed"))).toBe(false);
  });
});

describe("consumeChunkAutoRetry", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // Node test env has no sessionStorage: stub an in-memory one.
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
  });

  it("allows exactly one automatic reload per session", () => {
    expect(consumeChunkAutoRetry()).toBe(true);
    expect(consumeChunkAutoRetry()).toBe(false);
    expect(consumeChunkAutoRetry()).toBe(false);
  });

  it("never allows auto-reload when storage is unreadable (no loop)", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(consumeChunkAutoRetry()).toBe(false);
  });
});

describe("clearDocumentCaches", () => {
  it("deletes only metto-pages caches", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => [
        "metto-pages",
        "metto-pages-abc123",
        "metto-next-static",
        "serwist-precache-v2-/",
      ],
      delete: async (k: string) => {
        deleted.push(k);
        return true;
      },
    });
    await clearDocumentCaches();
    expect(deleted.sort()).toEqual(["metto-pages", "metto-pages-abc123"]);
    vi.unstubAllGlobals();
  });

  it("resolves when Cache Storage is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(clearDocumentCaches()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
