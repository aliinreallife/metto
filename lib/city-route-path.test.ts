import { describe, expect, it } from "vitest";
import { createCityPathPlanner, type PathNetwork } from "./city-route-path";
import { mashhadPreview } from "./mashhad-preview";

function fixture(): PathNetwork {
  const station = (id: string) => ({ id: `example:station:${id}`, cityId: "example", names: { en: id, fa: id }, location: { lat: 36, lng: 59 }, status: "operational" });
  return {
    cityId: "example", stations: [station("a"), station("b"), station("c")],
    lines: [{ id: "example:line:1", names: { en: "1", fa: "۱" }, color: "#000000" }],
    routes: [{ id: "example:route:1", lineId: "example:line:1", stops: ["a", "b", "c"].map(id => ({ stationId: `example:station:${id}`, status: "operational" })) }],
    segments: ["ab", "bc"].map(pair => ({ routeId: "example:route:1", from: `example:station:${pair[0]}`, to: `example:station:${pair[1]}`, status: "operational" })),
    transferLinks: [],
  };
}

describe("unscheduled city path routing", () => {
  it("keeps 36 Line 1/2 stations and excludes the disputed Line 3", () => {
    expect(mashhadPreview.stations).toHaveLength(36);
    expect(mashhadPreview.lines.map(l => l.id)).toEqual(["mashhad:line:1", "mashhad:line:2"]);
    expect(mashhadPreview.findPath("mashhad:station:bab-al-javad", "mashhad:station:airport")).toBeNull();
  });

  it("routes every directed station pair with city-scoped identifiers and no timing fields", () => {
    let pairs = 0;
    for (const from of mashhadPreview.stations) for (const to of mashhadPreview.stations) {
      if (from.id === to.id) continue;
      const route = mashhadPreview.findPath(from.id, to.id)!;
      expect(route).not.toBeNull();
      expect(Object.keys(route).sort()).toEqual(["cityId", "legs", "stationIds", "stops", "transfers"]);
      expect(route.stationIds[0]).toBe(from.id);
      expect(route.stationIds.at(-1)).toBe(to.id);
      expect(route.stationIds.every(id => id.startsWith("mashhad:station:"))).toBe(true);
      expect(route.transfers.length).toBeLessThanOrEqual(1);
      expect(route.stops).toBe(route.stationIds.length - 1);
      pairs++;
    }
    expect(pairs).toBe(1260);
  });

  it("changes at Shariati without inventing a transfer duration", () => {
    const route = mashhadPreview.findPath("mashhad:station:airport", "mashhad:station:tabarsi")!;
    expect(route.transfers).toEqual([{
      stationId: "mashhad:station:shariati", fromLineId: "mashhad:line:1", toLineId: "mashhad:line:2",
    }]);
    expect(route.legs.map(l => l.lineId)).toEqual(["mashhad:line:1", "mashhad:line:2"]);
    expect(mashhadPreview.getStationLineIds("mashhad:station:shariati")).toHaveLength(2);
    expect(mashhadPreview.getStationLineIds("mashhad:station:basij")).toEqual(["mashhad:line:1"]);
  });

  it("rejects Tehran identifiers, unknown endpoints, and same-station trips", () => {
    expect(mashhadPreview.findPath("tajrish", "mashhad:station:airport")).toBeNull();
    expect(mashhadPreview.findPath("tehran:station:shariati", "mashhad:station:airport")).toBeNull();
    expect(mashhadPreview.findPath("mashhad:station:airport", "mashhad:station:airport")).toBeNull();
  });

  it("shows the service terminal in the actual direction, rather than the alighting stop", () => {
    const planner = createCityPathPlanner(fixture());
    expect(planner.getTerminal("example:line:1", "example:station:a", "example:station:b")).toBe("example:station:c");
    expect(planner.getTerminal("example:line:1", "example:station:c", "example:station:b")).toBe("example:station:a");
    expect(planner.getTerminal("example:line:1", "example:station:a", "tehran:station:basij")).toBeUndefined();
    expect(planner.getTerminal("example:line:1", "example:station:a", "example:station:a")).toBeUndefined();
  });

  it("allows operational tracks through a non-boardable stop, but blocks boarding there", () => {
    const network = fixture(); network.routes[0].stops[1].status = "under_construction";
    const planner = createCityPathPlanner(network);
    expect(planner.findPath("example:station:a", "example:station:c")?.stationIds)
      .toEqual(["example:station:a", "example:station:b", "example:station:c"]);
    expect(planner.findPath("example:station:a", "example:station:c")?.stops).toBe(1);
    expect(planner.findPath("example:station:b", "example:station:c")).toBeNull();
    network.segments[1].status = "under_construction";
    expect(createCityPathPlanner(network).findPath("example:station:a", "example:station:c")).toBeNull();
  });

  it("requires explicit usable interchange links and does not guess from shared coordinates", () => {
    const network = fixture();
    network.stations.push({ ...network.stations[0], id: "example:station:d" });
    network.lines.push({ ...network.lines[0], id: "example:line:2" });
    network.routes.push({ id: "example:route:2", lineId: "example:line:2", stops: ["b", "d"].map(id => ({ stationId: `example:station:${id}`, status: "operational" })) });
    network.segments.push({ routeId: "example:route:2", from: "example:station:b", to: "example:station:d", status: "operational" });
    expect(createCityPathPlanner(network).findPath("example:station:a", "example:station:d")).toBeNull();
    network.transferLinks.push({ stationId: "example:station:b", fromLineId: "example:line:1", toLineId: "example:line:2" });
    expect(createCityPathPlanner(network).findPath("example:station:a", "example:station:d")?.transfers).toHaveLength(1);
    network.routes[0].stops[1].status = "under_construction";
    expect(createCityPathPlanner(network).findPath("example:station:a", "example:station:d")).toBeNull();
  });

  it("fails closed for mixed-city inputs and unsupported same-line service branches", () => {
    const network = fixture(); network.stations[0].cityId = "tehran";
    expect(() => createCityPathPlanner(network)).toThrow(/mixed-city/);
    const branch = fixture(); branch.routes.push({ ...branch.routes[0], id: "example:route:branch" });
    expect(() => createCityPathPlanner(branch)).toThrow(/Unsupported route/);
  });
});
