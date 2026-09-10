import { describe, expect, it } from "vitest";
import {
  CANONICAL_STATIC_DOCS,
  canonicalDocFallbackFor,
  isCanonicalStaticDoc,
} from "./document-fallback";

const ORIGIN = "https://metto.ir";

function nav(url: string, mode = "navigate", destination = "document") {
  return { mode, destination, url, origin: ORIGIN };
}

describe("isCanonicalStaticDoc", () => {
  it("matches exactly the four static documents", () => {
    expect(CANONICAL_STATIC_DOCS).toEqual(["/", "/map", "/stations", "/nearby"]);
    for (const p of ["/", "/map", "/stations", "/nearby"]) {
      expect(isCanonicalStaticDoc(p)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const p of [
      "/map/",
      "/stations/123",
      "/api/route",
      "/api/holidays",
      "/manifest.webmanifest",
      "/schedule-data.json",
      "/holidays.json",
      "",
      "map",
    ]) {
      expect(isCanonicalStaticDoc(p)).toBe(false);
    }
  });
});

describe("canonicalDocFallbackFor", () => {
  it("maps query-bearing navigations to their canonical document", () => {
    expect(
      canonicalDocFallbackFor("/map", nav(`${ORIGIN}/map?from=ahang&to=aliabad`)),
    ).toBe("/map");
    expect(
      canonicalDocFallbackFor(
        "/nearby",
        nav(`${ORIGIN}/nearby?from=tajrish&to=tehran-sadeghiyeh&x=1`),
      ),
    ).toBe("/nearby");
    expect(
      canonicalDocFallbackFor("/stations", nav(`${ORIGIN}/stations?from=ahang`)),
    ).toBe("/stations");
    expect(
      canonicalDocFallbackFor("/", nav(`${ORIGIN}/?from=ahang&to=aliabad`)),
    ).toBe("/");
  });

  it("never cross-matches another known page (no / fallback for /map)", () => {
    expect(
      canonicalDocFallbackFor("/", nav(`${ORIGIN}/map?from=ahang`)),
    ).toBeNull();
    expect(
      canonicalDocFallbackFor("/map", nav(`${ORIGIN}/stations?from=ahang`)),
    ).toBeNull();
  });

  it("rejects non-navigations: RSC, prefetch, subresources, API", () => {
    // RSC/Flight payload (fetch destination is empty, mode is cors).
    expect(
      canonicalDocFallbackFor(
        "/map",
        nav(`${ORIGIN}/map?from=ahang`, "cors", ""),
      ),
    ).toBeNull();
    // Prefetch-style request.
    expect(
      canonicalDocFallbackFor(
        "/map",
        nav(`${ORIGIN}/map?from=ahang`, "no-cors", ""),
      ),
    ).toBeNull();
    expect(
      canonicalDocFallbackFor("/map", nav(`${ORIGIN}/map`, "navigate", "image")),
    ).toBeNull();
    expect(
      canonicalDocFallbackFor("/api/route", nav(`${ORIGIN}/api/route?from=ahang`)),
    ).toBeNull();
  });

  it("rejects cross-origin and malformed URLs", () => {
    expect(
      canonicalDocFallbackFor("/map", {
        ...nav(`${ORIGIN}/map`),
        url: "https://evil.example/map?from=ahang",
      }),
    ).toBeNull();
    expect(
      canonicalDocFallbackFor("/map", nav("::not-a-url::")),
    ).toBeNull();
  });
});
