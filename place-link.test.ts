import { describe, expect, it } from "vitest";
import {
  buildMapHref,
  buildTabHref,
  decodePlacePin,
  encodePlacePin,
  estimateWalkMinutes,
  isTooFarToWalk,
  parsePlaceParam,
} from "./lib/geo";

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
    const href = buildTabHref("/", {
      from: "a",
      originPlace: { lat: 35.7, lng: 51.3, label: "x" },
    });
    expect(href.startsWith("/?")).toBe(true);
    expect(href).toContain("op=35.7000%2C51.3000%2Cx");
  });
});

describe("walk estimates", () => {
  it("uses 5 km/h and warns past 1.5 km", () => {
    expect(Math.round(estimateWalkMinutes(1.5))).toBe(18);
    expect(isTooFarToWalk(1.5)).toBe(false);
    expect(isTooFarToWalk(1.5001)).toBe(true);
  });
});
