import { describe, expect, it } from "vitest";
import { displayPlaceLabel, isUnresolvedMapPointLabel } from "./lib/geocoding";
import {
  buildMapHref,
  buildTabHref,
  decodePlacePin,
  directWalk,
  encodePlacePin,
  estimateWalkMinutes,
  isTooFarToWalk,
  nearestStations,
  parsePlaceParam,
} from "./lib/geo";

describe("selected map point labels", () => {
  it("uses localized descriptions for coordinates previously saved as names", () => {
    for (const raw of ["35.6316, 51.2794", "35.6316,51.2794", "35.6316، 51.2794", "35.6316"]) {
      expect(isUnresolvedMapPointLabel(raw)).toBe(true);
      expect(displayPlaceLabel(raw, "fa")).toBe("نقطه انتخاب‌شده روی نقشه");
      expect(displayPlaceLabel(raw, "en")).toBe("Selected map point");
    }
  });

  it("localizes a saved generic label across languages, without obscuring real place names", () => {
    expect(displayPlaceLabel("نقطه انتخاب‌شده روی نقشه", "en")).toBe("Selected map point");
    expect(displayPlaceLabel("Selected map point", "fa")).toBe("نقطه انتخاب‌شده روی نقشه");
    expect(displayPlaceLabel("آزادگان، تهران", "fa")).toBe("آزادگان، تهران");
    expect(displayPlaceLabel("Iran Mall, Tehran, Iran", "en")).toBe("Iran Mall");
    expect(isUnresolvedMapPointLabel("Azadegan")).toBe(false);
  });
});

describe("compact place params (op/dp)", () => {
  it("round-trips lat/lng/label through encode/decode", () => {
    const pin = { lat: 35.7770709, lng: 51.3513507, label: "اپال" };
    const decoded = decodePlacePin(encodePlacePin(pin));
    expect(decoded).toEqual({ lat: 35.7771, lng: 51.3514, label: "اپال" });
  });

  it("keeps commas inside labels", () => {
    expect(decodePlacePin("35.7,51.3,a, b, c")?.label).toBe("a, b, c");
  });

  it("rejects malformed input", () => {
    expect(decodePlacePin(null)).toBeNull();
    expect(decodePlacePin("35.7")).toBeNull();
    expect(decodePlacePin("x,y,z")).toBeNull();
    expect(decodePlacePin("35.7,51.3,")).toBeNull();
    expect(decodePlacePin("35.7,51.3, ")).toBeNull();
  });

  it("prefers compact params and falls back to legacy oPlat/oPlng/oPlabel", () => {
    const compact = new URLSearchParams({
      op: encodePlacePin({ lat: 35.75, lng: 51.19, label: "بازار بزرگ ایران" }),
      oPlat: "1",
      oPlng: "2",
      oPlabel: "stale",
    });
    expect(parsePlaceParam(compact, "oP")).toEqual({
      lat: 35.75,
      lng: 51.19,
      label: "بازار بزرگ ایران",
    });

    const legacy = new URLSearchParams({
      dPlat: "35.75",
      dPlng: "51.19",
      dPlabel: "Iran Mall",
    });
    expect(parsePlaceParam(legacy, "dP")).toEqual({
      lat: 35.75,
      lng: 51.19,
      label: "Iran Mall",
    });
    expect(parsePlaceParam(new URLSearchParams(), "oP")).toBeNull();
  });

  it("emits compact links that stay short", () => {
    const href = buildMapHref({
      from: "meydan-e-ketab",
      to: "iran-khodro",
      originPlace: { lat: 35.7770709, lng: 51.3513507, label: "اپال" },
      destPlace: { lat: 35.7537528, lng: 51.1926128, label: "بازار بزرگ ایران" },
    });
    expect(href.startsWith("/map?")).toBe(true);
    expect(href).not.toContain("oPlat");
    expect(href.length).toBeLessThan(250);
    // And the emitted link parses back.
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(parsePlaceParam(qs, "oP")?.label).toBe("اپال");
    expect(parsePlaceParam(qs, "dP")?.label).toBe("بازار بزرگ ایران");
  });

  it("buildTabHref keeps any base path with the same compact params", () => {
    const href = buildTabHref("/route", {
      from: "a",
      originPlace: { lat: 35.7, lng: 51.3, label: "x" },
    });
    expect(href.startsWith("/route?")).toBe(true);
    expect(href).toContain("op=35.7000%2C51.3000%2Cx");
  });
});

describe("walk estimates", () => {
  it("uses 5 km/h and warns past 1.5 km", () => {
    expect(Math.round(estimateWalkMinutes(1.5))).toBe(18);
    expect(isTooFarToWalk(1.5)).toBe(false);
    expect(isTooFarToWalk(1.5001)).toBe(true);
  });

  it("measures a direct walk between distinct close pins", () => {
    const w = directWalk(
      { lat: 35.7265, lng: 51.2427 },
      { lat: 35.7265, lng: 51.2426 },
    );
    expect(w).not.toBeNull();
    expect(w!.walkKm).toBeGreaterThan(0);
    expect(w!.walkKm).toBeLessThan(0.05);
    expect(w!.walkMin).toBeGreaterThan(0);
  });

  it("returns null for identical or missing points", () => {
    const p = { lat: 35.7265, lng: 51.2427 };
    expect(directWalk(p, { ...p })).toBeNull();
    expect(directWalk(null, p)).toBeNull();
    expect(directWalk(p, null)).toBeNull();
    expect(directWalk(null, null)).toBeNull();
  });

  it("skips non-boardable stations by default", () => {
    // Vavan is under construction: standing on top of it must resolve to
    // an operational station instead.
    const results = nearestStations(35.5145, 51.3001, { limit: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].station.id).not.toBe("vavan");
    expect(
      results.every((r) => r.station.status === "operational"),
    ).toBe(true);
  });

  it("returns non-operational stations only on explicit opt-out", () => {
    const results = nearestStations(35.5145, 51.3001, {
      limit: 1,
      operationalOnly: false,
    });
    expect(results[0]?.station.id).toBe("vavan");
  });
});
