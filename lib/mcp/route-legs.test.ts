// get_route now reports arrive-at / leave-at times: per-leg departAt/arriveAt
// plus per-stop times from the timetable, journey departedAt/estimatedArrival.
// Fixed Monday instant keeps timetable lookups deterministic.
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMettoMcpServer } from "./create-server";
import { buildRouteLegs } from "./tool-defs";
import { executeWebMcpTool } from "./client-executors";

const NEVER_HOLIDAY = () => false;

const DEPART_AT = "2026-09-07T14:00:00+03:30"; // Monday afternoon

async function callRemoteGetRoute(args: Record<string, unknown>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMettoMcpServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "route-times-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    return (await client.callTool({ name: "get_route", arguments: args })) as unknown as {
      content: { type: string; text: string }[];
      structuredContent: Record<string, unknown>;
    };
  } finally {
    await client.close();
  }
}

describe("get_route arrival/departure times", () => {
  it("remote: legs carry per-stop timetable times", async () => {
    const result = await callRemoteGetRoute({
      from: "tajrish",
      to: "tehran-sadeghiyeh",
      depart_at: DEPART_AT,
    });
    const structured = result.structuredContent;
    expect(typeof structured.departedAt).toBe("string");
    const legs = structured.legs as {
      from: string;
      to: string;
      line: number;
      departAt: string | null;
      arriveAt: string | null;
      timing: string;
      stops: { station: string; time: string | null }[];
    }[];
    expect(legs.length).toBeGreaterThan(0);
    // First leg boards at the origin with a real timetable time.
    expect(legs[0].from).toBe("tajrish");
    expect(legs[0].departAt).toMatch(/^\d{2}:\d{2}$/);
    expect(legs[0].stops[0]).toEqual({ station: "tajrish", time: legs[0].departAt });
    // Every stop on a timetable leg has a time; legs chain into each other.
    for (const leg of legs) {
      if (leg.timing === "timetable") {
        for (const s of leg.stops) expect(s.time).toMatch(/^\d{2}:\d{2}$/);
      }
    }
    for (let i = 1; i < legs.length; i++) {
      expect(legs[i].from).toBe(legs[i - 1].to);
    }
    // Human-readable text carries the times too.
    expect(result.content[0].text).toMatch(/Depart: \d{2}:\d{2} → Arrive:/);
  });

  it("remote: last leg arrives at the destination", async () => {
    const result = await callRemoteGetRoute({
      from: "tajrish",
      to: "tehran-sadeghiyeh",
      depart_at: DEPART_AT,
    });
    const structured = result.structuredContent;
    const legs = structured.legs as { to: string; arriveAt: string | null }[];
    expect(legs[legs.length - 1].to).toBe("tehran-sadeghiyeh");
    expect(structured.estimatedArrival).toBe(legs[legs.length - 1].arriveAt);
  });

  it("buildRouteLegs: estimated legs keep null times instead of failing", () => {
    const legs = buildRouteLegs({
      segments: [{ stations: ["a", "b"], line: 1 }],
      trips: [null],
      legTiming: ["estimated"],
    });
    expect(legs).toEqual([
      {
        from: "a",
        to: "b",
        line: 1,
        departAt: null,
        arriveAt: null,
        timing: "estimated",
        stops: [
          { station: "a", time: null },
          { station: "b", time: null },
        ],
      },
    ]);
  });

  it("webmcp: executor returns the same legs", async () => {
    const result = (await executeWebMcpTool(
      "get_route",
      { from: "tajrish", to: "tehran-sadeghiyeh", depart_at: DEPART_AT },
      { isHolidayDate: NEVER_HOLIDAY },
    )) as unknown as { structuredContent: Record<string, unknown> };
    const legs = result.structuredContent.legs as { departAt: string | null }[];
    expect(legs.length).toBeGreaterThan(0);
    expect(legs[0].departAt).toMatch(/^\d{2}:\d{2}$/);
  });
});
