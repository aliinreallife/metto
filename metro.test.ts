import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STATIONS } from "./lib/metro/stations";
import { ROUTES } from "./lib/metro/routes";
import { SEGMENTS, SEGMENT_STATUS_OVERRIDES } from "./lib/metro/segments";
import {
  buildMapEdges,
  canBoardAtStation,
  canTransferAtStation,
  getOperationalNeighbors,
  getOperationalStationLines,
  getRouteStations,
  getRouteTerminals,
  getStation,
  getStationLines,
  getStationNeighbors,
  getStationTerminalRoutes,
  getStopStatus,
  isBranchJunction,
  isInterchange,
  isOperationalInterchange,
  resolveStationId,
} from "./lib/metro/selectors";
import { validateMetro } from "./lib/metro/validation";
import { findRoute } from "./lib/route";

describe("metro dataset validation", () => {
  it("has no consistency errors", () => {
    expect(validateMetro()).toEqual([]);
  });

  it("has 151 unique stations", () => {
    expect(STATIONS.length).toBe(151);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(151);
  });

  it("has no self-loop segments", () => {
    for (const s of SEGMENTS) expect(s.from).not.toBe(s.to);
  });

  it("locks the Line 4 west sequence", () => {
    const ids = getRouteStations("line-4-main");
    const tail = ids.slice(ids.indexOf("eram-e-sabz"));
    expect(tail).toEqual([
      "eram-e-sabz",
      "allameh-jafari",
      "ayatollah-kashani",
      "chaharbagh",
    ]);
    // No separate Chaharbagh branch route may exist.
    expect(ROUTES.some((r) => r.id === "line-4-chaharbagh")).toBe(false);
    expect(getRouteTerminals("line-4-main")).toEqual([
      "shahid-kolahdooz",
      "chaharbagh",
    ]);
  });

  it("locks the Line 5 west sequence with Fakhrizadeh", () => {
    const ids = getRouteStations("line-5-main");
    expect(ids.slice(ids.indexOf("golshahr"))).toEqual([
      "golshahr",
      "shahid-fakhrizadeh",
      "shahid-sepahbod-qasem-soleimani",
    ]);
    const f = getStation("shahid-fakhrizadeh");
    expect(f).toBeDefined();
    expect(f!.status).toBe("operational");
    expect(f!.location).toEqual({ lat: 35.91758, lng: 50.7911 });
    expect(getStationLines("shahid-fakhrizadeh")).toEqual([5]);
    const neighbors = getStationNeighbors("shahid-fakhrizadeh")
      .filter((n) => n.lineId === 5)
      .map((n) => n.stationId)
      .sort();
    expect(neighbors).toEqual([
      "golshahr",
      "shahid-sepahbod-qasem-soleimani",
    ]);
    // No direct Golshahr <-> Soleimani edge may remain.
    expect(
      SEGMENTS.some(
        (s) =>
          (s.from === "golshahr" &&
            s.to === "shahid-sepahbod-qasem-soleimani") ||
          (s.from === "shahid-sepahbod-qasem-soleimani" && s.to === "golshahr"),
      ),
    ).toBe(false);
  });

  it("derives interchanges (all-lines) and operational interchanges", () => {
    const found = STATIONS.filter((s) => isInterchange(s.id)).map((s) => s.id);
    // 18 legacy + ayatollah-kashani (Line 4 main now runs through it).
    expect(found).toHaveLength(19);
    expect(found).toContain("ayatollah-kashani");
    // Kashani is a physical interchange but NOT yet an operational one:
    // its Line 4 stop is under construction while Line 6 is operational.
    expect(isOperationalInterchange("ayatollah-kashani")).toBe(false);
    expect(getOperationalStationLines("ayatollah-kashani")).toEqual([6]);
    expect(isOperationalInterchange("shohada-ye-hefdah-e-shahrivar")).toBe(true);
  });

  it("models Kashani per-line stop status", () => {
    expect(getStation("ayatollah-kashani")!.status).toBe("operational");
    expect(getStopStatus("line-6-main", "ayatollah-kashani")).toBe("operational");
    expect(getStopStatus("line-4-main", "ayatollah-kashani")).toBe(
      "under_construction",
    );
    expect(canBoardAtStation("ayatollah-kashani", 6)).toBe(true);
    expect(canBoardAtStation("ayatollah-kashani", 4)).toBe(false);
    expect(canTransferAtStation("ayatollah-kashani", 6, 4)).toBe(false);
    expect(canTransferAtStation("imam-khomeini", 1, 2)).toBe(true);
  });

  it("treats the Parand/Mehrabad forks as branch junctions, not interchanges", () => {
    expect(isBranchJunction("shahed-baghershahr")).toBe(true);
    expect(isBranchJunction("bimeh")).toBe(true);
    expect(isInterchange("shahed-baghershahr")).toBe(false);
    expect(isInterchange("bimeh")).toBe(false);
    expect(getStationLines("shahed-baghershahr")).toEqual([1]);
  });

  it("exposes deterministic branch-aware terminals", () => {
    expect(getRouteTerminals("line-1-main")).toEqual(["tajrish", "kahrizak"]);
    expect(getRouteTerminals("line-1-parand")).toEqual([
      "shahed-baghershahr",
      "shahr-e-parand",
    ]);
    expect(getRouteTerminals("line-4-mehrabad")).toEqual([
      "bimeh",
      "mehrabad-airport-terminal-4-6",
    ]);
    expect(getStationTerminalRoutes("shahed-baghershahr")).toContain(
      "line-1-parand",
    );
    // Junction is not a terminal of the main route.
    expect(getStationTerminalRoutes("shahed-baghershahr")).not.toContain(
      "line-1-main",
    );
  });

  it("passes through Vavan without boarding there", () => {
    expect(canBoardAtStation("vavan")).toBe(false);
    // ...but the operational track keeps Airport/Parand connected.
    expect(
      getOperationalNeighbors("vavan").map((n) => n.stationId).sort(),
    ).toEqual(["emam-khomeini-airport", "namayeshgah-e-shahr-e-aftab"]);
    // Vavan cannot be a trip endpoint.
    expect(findRoute("vavan", "tajrish")).toBeNull();
    expect(findRoute("tajrish", "vavan")).toBeNull();
    // Parand branch service runs through it.
    const r = findRoute("shahed-baghershahr", "shahr-e-parand");
    expect(r).not.toBeNull();
    expect(r!.path).toContain("vavan");
    // ...without counting it as a passenger stop.
    expect(r!.numStops).toBe(r!.path.slice(1).filter((s) => s !== "vavan").length);
    expect(r!.numStops).toBe(3);
  });

  it("keeps construction tracks explicit and independent of stations", () => {
    const uc = SEGMENTS.filter((s) => s.status !== "operational").map((s) => s.id).sort();
    expect(uc).toEqual(Object.keys(SEGMENT_STATUS_OVERRIDES).sort());
    expect(uc).toHaveLength(6);
    // Network-level: operational traversal is symmetric.
    for (const s of STATIONS) {
      for (const n of getOperationalNeighbors(s.id)) {
        expect(
          getOperationalNeighbors(n.stationId).map((x) => x.stationId),
        ).toContain(s.id);
      }
    }
  });

  it("returns line/branch context on neighbors", () => {
    const ns = getStationNeighbors("shahed-baghershahr");
    const line1 = ns.filter((n) => n.lineId === 1);
    expect(line1.length).toBeGreaterThanOrEqual(3);
    expect(
      line1.some((n) => n.routeId === "line-1-parand" && n.branchId === "parand"),
    ).toBe(true);
  });

  it("resolves legacy, historical and transliteration aliases", () => {
    for (const [alias, slug] of [
      ["Darvazeh Dolat", "darvazeh-dolat"],
      ["Tehran (Sadeghiyeh)", "tehran-sadeghiyeh"],
      ["Shahed - BagherShahr", "shahed-baghershahr"],
      ["Sa'adi", "saadi"],
      ["Qa'em", "qaem"],
      ["Mehrabad Airport Terminal 1&2", "mehrabad-airport-terminal-1-2"],
      ["Bahar Shiraz (Khanevadeh Hospital)", "bahar-shiraz-khanevadeh-hospital"],
      ["Payaneh Jonoub(Jonoub Terminal)", "payaneh-jonoub-jonoub-terminal"],
      ["Shahid Fakhrizade", "shahid-fakhrizadeh"],
      ["Mammut", "shahid-fakhrizadeh"],
      ["ماموت", "shahid-fakhrizadeh"],
      ["Shahid Nejatollahi", "maryam-e-moghaddas"],
      ["Gholhak", "qolhak"],
      ["Darvazeh Dowlat", "darvazeh-dolat"],
      ["Pirouzi", "piroozi"],
      ["Garmdarreh", "garmdareh"],
      ["Atmosfer", "atmosphere"],
    ]) {
      expect(resolveStationId(alias)).toBe(slug);
    }
  });

  it("builds routable map edges for every route", () => {
    const edges = buildMapEdges();
    expect(edges.length).toBe(SEGMENTS.length);
    for (const r of ROUTES) {
      const ids = getRouteStations(r.id);
      for (let i = 0; i < ids.length - 1; i++) {
        const key = [ids[i], ids[i + 1]].sort().join("|");
        expect(
          edges.some((e) => [e.a, e.b].sort().join("|") === key),
          `${r.id}: ${ids[i]} <-> ${ids[i + 1]}`,
        ).toBe(true);
      }
    }
  });

  it("resolves every schedule-data station id with zero exceptions", () => {
    const raw = readFileSync(join(__dirname, "public/schedule-data.json"), "utf8");
    const data: unknown = JSON.parse(raw);
    const ids = new Set<string>();
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) {
        for (const x of o) walk(x);
      } else if (o && typeof o === "object") {
        for (const [k, v] of Object.entries(o)) {
          if (
            (k === "stationId" ||
              k === "direction" ||
              k === "terminalA" ||
              k === "terminalB") &&
            typeof v === "string"
          ) {
            ids.add(v);
          } else walk(v);
        }
      }
    };
    walk(data);
    const dangling = [...ids].filter(
      (id) => resolveStationId(id) === undefined,
    );
    expect(dangling).toEqual([]);
  });
});
