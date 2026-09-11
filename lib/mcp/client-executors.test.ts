// WebMCP client executors: contract, validation, and departure pass-through.
// Routing runs on the client-safe domain path (geometric fallback when the
// timetable isn't loaded in this environment — deterministic either way).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findRouteWithSchedule } from "../schedule-server";
import { executeWebMcpTool } from "./client-executors";
import { INVALID_DEPART_AT_ERROR } from "./tool-defs";

const NEVER_HOLIDAY = () => false;

type Structured = Record<string, unknown>;

function structuredOf(
  result: Awaited<ReturnType<typeof executeWebMcpTool>>,
): Structured {
  expect(result.isError).not.toBe(true);
  return ("structuredContent" in result ? result.structuredContent : {}) as Structured;
}

// 2026-09-05T20:29:30Z == Saturday 23:59:30 Asia/Tehran.
const FROZEN_MS = Date.parse("2026-09-05T20:29:30Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("get_route executor", () => {
  it("routes successfully and returns MCP-aligned shapes", async () => {
    const result = await executeWebMcpTool(
      "get_route",
      { from: "tajrish", to: "tehran-sadeghiyeh" },
      { isHolidayDate: NEVER_HOLIDAY },
    );
    const structured = structuredOf(result);
    expect(structured.stops).toBeGreaterThan(0);
    expect(Array.isArray(structured.path)).toBe(true);
    expect(Array.isArray(structured.hops)).toBe(true);
    expect(typeof structured.route).toBe("string");
    expect(typeof structured.canonicalUrl).toBe("string");
    expect(structured.canonicalUrl).toContain("from=tajrish");
  });

  it("passes an explicit depart_at through to routing (Tehran instant)", async () => {
    const result = await executeWebMcpTool(
      "get_route",
      {
        from: "tajrish",
        to: "tehran-sadeghiyeh",
        depart_at: "2026-09-07T14:00:00+03:30",
      },
      { isHolidayDate: NEVER_HOLIDAY },
    );
    const structured = structuredOf(result);
    // 14:00 Tehran proves the supplied instant (not frozen Saturday now) was used.
    expect(structured.departedAt).toBe("14:00");
    expect(structured.scheduleNote).toMatch(/^Saturday–Wednesday/);
  });

  it("Z and +03:30 forms of the same instant agree", async () => {
    const a = structuredOf(
      await executeWebMcpTool(
        "get_route",
        { from: "tajrish", to: "tehran-sadeghiyeh", depart_at: "2026-09-07T14:00:00+03:30" },
        { isHolidayDate: NEVER_HOLIDAY },
      ),
    );
    const b = structuredOf(
      await executeWebMcpTool(
        "get_route",
        { from: "tajrish", to: "tehran-sadeghiyeh", depart_at: "2026-09-07T10:30:00Z" },
        { isHolidayDate: NEVER_HOLIDAY },
      ),
    );
    expect(a.path).toEqual(b.path);
    expect(a.departedAt).toBe(b.departedAt);
  });

  it("omitted depart_at defaults to now (frozen Saturday instant)", async () => {
    const result = await executeWebMcpTool(
      "get_route",
      { from: "tajrish", to: "tehran-sadeghiyeh" },
      { isHolidayDate: NEVER_HOLIDAY },
    );
    const structured = structuredOf(result);
    expect(structured.departedAt).toBe("23:59");
  });

  it("rejects naive depart_at without timezone", async () => {
    const result = await executeWebMcpTool(
      "get_route",
      { from: "tajrish", to: "tehran-sadeghiyeh", depart_at: "2026-09-07T14:00:00" },
      { isHolidayDate: NEVER_HOLIDAY },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(INVALID_DEPART_AT_ERROR);
  });

  it("reports unknown stations without throwing", async () => {
    const result = await executeWebMcpTool(
      "get_route",
      { from: "nope", to: "tehran-sadeghiyeh" },
      { isHolidayDate: NEVER_HOLIDAY },
    );
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("Station not found");
  });

  it("matches the server pipeline path for the same instant", async () => {
    const departAt = "2026-09-07T14:00:00+03:30";
    const server = await findRouteWithSchedule("tajrish", "tehran-sadeghiyeh", departAt);
    expect(server?.ok).toBe(true);
    const client = structuredOf(
      await executeWebMcpTool(
        "get_route",
        { from: "tajrish", to: "tehran-sadeghiyeh", depart_at: departAt },
        { isHolidayDate: NEVER_HOLIDAY },
      ),
    );
    if (server?.ok) {
      expect(client.path).toEqual(server.route.path);
      expect(client.stops).toBe(server.route.numStops);
    }
  });

  it("honours AbortSignal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await executeWebMcpTool(
      "get_route",
      { from: "tajrish", to: "tehran-sadeghiyeh" },
      { isHolidayDate: NEVER_HOLIDAY, signal: controller.signal },
    );
    expect(result.isError).toBe(true);
  });
});

describe("station executors", () => {
  it("list_stations returns all stations and filters", async () => {
    const all = structuredOf(await executeWebMcpTool("list_stations", {}));
    expect(all.count as number).toBeGreaterThan(100);
    const filtered = structuredOf(
      await executeWebMcpTool("list_stations", { search: "tajrish" }),
    );
    expect(filtered.count).toBe(1);
    const line = structuredOf(
      await executeWebMcpTool("list_stations", { line: 1 }),
    );
    expect(line.count as number).toBeGreaterThan(0);
  });

  it("get_station returns details; unknown id is a message, not a throw", async () => {
    const known = structuredOf(
      await executeWebMcpTool("get_station", { id: "tajrish" }),
    );
    expect(known.id).toBe("tajrish");
    const unknown = await executeWebMcpTool("get_station", { id: "nope" });
    expect(unknown.isError).not.toBe(true);
    expect(unknown.content[0].text).toContain("not found");
  });

  it("find_nearby validates coordinates and clamps limit", async () => {
    const ok = structuredOf(
      await executeWebMcpTool("find_nearby", { lat: 35.804, lng: 51.433 }),
    );
    expect((ok.results as unknown[]).length).toBe(5);
    const clamped = structuredOf(
      await executeWebMcpTool("find_nearby", { lat: 35.804, lng: 51.433, limit: 99 }),
    );
    expect((clamped.results as unknown[]).length).toBeLessThanOrEqual(20);
    const bad = await executeWebMcpTool("find_nearby", { lat: 200, lng: 51.433 });
    expect(bad.isError).toBe(true);
  });

  it("rejects unknown tools and non-object args without throwing", async () => {
    expect((await executeWebMcpTool("daydream", {})).isError).toBe(true);
    expect((await executeWebMcpTool("get_route", null)).isError).toBe(true);
  });
});
