import { describe, expect, it } from "vitest";
import {
  CARTO_TILE_CACHE,
  MAX_CARTO_TILES,
  MAX_CARTO_TILE_AGE_S,
  isCacheableTileResponse,
  isCartoTileRequest,
} from "./carto-tiles";

const tile = (overrides: Partial<Parameters<typeof isCartoTileRequest>[0]> = {}) => ({
  hostname: "b.basemaps.cartocdn.com",
  pathname: "/dark_nolabels/11/1315/806.png",
  method: "GET",
  destination: "image",
  ...overrides,
});

describe("carto tile matcher", () => {
  it("matches viewed raster tiles on all four subdomains", () => {
    for (const s of ["a", "b", "c", "d"]) {
      expect(
        isCartoTileRequest(tile({ hostname: `${s}.basemaps.cartocdn.com` })),
      ).toBe(true);
    }
  });
  it("matches retina tiles and keyed URLs (query is part of the key)", () => {
    expect(
      isCartoTileRequest(tile({ pathname: "/dark_nolabels/14/8809/5375@2x.png" })),
    ).toBe(true);
  });
  it("rejects Esri satellite and label endpoints", () => {
    expect(
      isCartoTileRequest(
        tile({
          hostname: "server.arcgisonline.com",
          pathname: "/ArcGIS/rest/services/World_Imagery/MapServer/tile/11/806/1315",
        }),
      ),
    ).toBe(false);
    expect(
      isCartoTileRequest(
        tile({
          hostname: "server.arcgisonline.com",
          pathname: "/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/11/806/1315",
        }),
      ),
    ).toBe(false);
  });
  it("rejects Nominatim, timestamp.ir and FingerprintJS", () => {
    expect(
      isCartoTileRequest(
        tile({ hostname: "nominatim.openstreetmap.org", pathname: "/search" }),
      ),
    ).toBe(false);
    expect(
      isCartoTileRequest(
        tile({ hostname: "api.timestamp.ir", pathname: "/v1/events" }),
      ),
    ).toBe(false);
    expect(
      isCartoTileRequest(tile({ hostname: "fpnpmcdn.net", pathname: "/v4/x" })),
    ).toBe(false);
  });
  it("rejects arbitrary cross-origin and lookalike hosts", () => {
    expect(
      isCartoTileRequest(tile({ hostname: "evil-basemaps.cartocdn.com" })),
    ).toBe(false);
    expect(
      isCartoTileRequest(tile({ hostname: "basemaps.cartocdn.com.evil.io" })),
    ).toBe(false);
    expect(
      isCartoTileRequest(tile({ hostname: "basemaps.cartocdn.com" })),
    ).toBe(false);
    expect(
      isCartoTileRequest(tile({ hostname: "example.com", pathname: "/tile.png" })),
    ).toBe(false);
  });
  it("rejects non-tile CARTO paths and non-image/non-GET requests", () => {
    expect(
      isCartoTileRequest(tile({ pathname: "/rastertiles/voyager/11/1315/806.png" })),
    ).toBe(false);
    expect(
      isCartoTileRequest(tile({ pathname: "/gl/dark-matter-gl-style/style.json" })),
    ).toBe(false);
    expect(isCartoTileRequest(tile({ destination: "document" }))).toBe(false);
    expect(isCartoTileRequest(tile({ destination: "" }))).toBe(false);
    expect(isCartoTileRequest(tile({ method: "POST" }))).toBe(false);
  });
});

describe("tile response validation", () => {
  it("allows 200 basic, 200 cors, and opaque tiles", () => {
    expect(
      isCacheableTileResponse({ status: 200, type: "basic", redirected: false }),
    ).toBe(true);
    expect(
      isCacheableTileResponse({ status: 200, type: "cors", redirected: false }),
    ).toBe(true);
    expect(
      isCacheableTileResponse({ status: 0, type: "opaque", redirected: false }),
    ).toBe(true);
  });
  it("rejects redirects, opaqueredirect, errors and bad statuses", () => {
    expect(
      isCacheableTileResponse({ status: 0, type: "opaqueredirect", redirected: false }),
    ).toBe(false);
    expect(
      isCacheableTileResponse({ status: 0, type: "error", redirected: false }),
    ).toBe(false);
    expect(
      isCacheableTileResponse({ status: 200, type: "basic", redirected: true }),
    ).toBe(false);
    for (const status of [301, 302, 404, 500]) {
      expect(
        isCacheableTileResponse({ status, type: "basic", redirected: false }),
      ).toBe(false);
      expect(
        isCacheableTileResponse({ status, type: "cors", redirected: false }),
      ).toBe(false);
    }
    expect(
      isCacheableTileResponse({ status: 200, type: "default", redirected: false }),
    ).toBe(false);
  });
});

describe("tile cache bounds", () => {
  it("stays small and within the provider retention maximum", () => {
    expect(CARTO_TILE_CACHE).toBe("metto-carto-tiles");
    expect(MAX_CARTO_TILES).toBe(300);
    expect(MAX_CARTO_TILE_AGE_S).toBe(2_592_000);
    expect(MAX_CARTO_TILE_AGE_S).toBeLessThanOrEqual(30 * 24 * 60 * 60);
  });
});
