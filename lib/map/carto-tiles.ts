// Opportunistic, policy-bounded CARTO raster-tile cache.
// Policy basis: CARTO Basemaps Terms and Conditions (live copy:
// https://carto.com/legal/basemap-terms — verified text last updated
// 26 Aug 2026), §9.c Acceptable Use. It prohibits bulk downloading,
// server-side proxying/caching, and redistribution — and it expressly
// permits "caching map content on an end user's device or in an end
// user's browser for [up to] thirty (30) days". This module implements
// exactly that narrow allowance and nothing more:
//
// - browser (service-worker Cache Storage) only, never server-side;
// - at most MAX_CARTO_TILES entries, LRU via Serwist ExpirationPlugin;
// - nothing older than MAX_CARTO_TILE_AGE_S (30 days);
// - ONLY tiles the user naturally viewed (Leaflet <img> requests) —
//   no prefetch, no enumeration, no zoom-level crawling, no offline packs.
// - Esri, Nominatim, timestamp.ir and every other
//   third-party host structurally cannot match.
//
// This cache is OPTIONAL: it is not part of offline readiness, and an
// empty tile cache changes nothing about planner readiness.

/** Cache Storage name for opportunistically retained CARTO tiles. */
export const CARTO_TILE_CACHE = "metto-carto-tiles";

/** Hard entry cap (LRU). Deliberately small; raise only by product/legal decision. */
export const MAX_CARTO_TILES = 300;

/** Maximum retention, in seconds (30 days = provider maximum). */
export const MAX_CARTO_TILE_AGE_S = 30 * 24 * 60 * 60; // 2_592_000

/** Exact CDN hosts Leaflet's `{s}` subdomain rotation expands to. */
const CARTO_TILE_HOSTS: ReadonlySet<string> = new Set([
  "a.basemaps.cartocdn.com",
  "b.basemaps.cartocdn.com",
  "c.basemaps.cartocdn.com",
  "d.basemaps.cartocdn.com",
]);

/**
 * The only basemap path pattern Metto uses:
 * `https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}[@2x].png[?key=…]`
 * (Leaflet `{r}` renders as `@2x` on retina displays; `?key=` stays part of
 * the cache key and is never logged or surfaced anywhere.)
 */
const CARTO_TILE_PATH: RegExp =
  /^\/dark_nolabels\/\d+\/\d+\/\d+(@2x)?\.png$/;

export interface CartoTileRequestShape {
  hostname: string;
  pathname: string;
  method: string;
  /** Fetch destination, e.g. "image" for Leaflet <img> tiles. */
  destination: string;
}

/**
 * True only for a Leaflet-initiated CARTO raster tile fetch. Everything
 * else — Esri, Nominatim, other CARTO endpoints/styles, non-image or
 * non-GET requests, lookalike hostnames — returns false.
 */
export function isCartoTileRequest(req: CartoTileRequestShape): boolean {
  return (
    req.method === "GET" &&
    req.destination === "image" &&
    CARTO_TILE_HOSTS.has(req.hostname) &&
    CARTO_TILE_PATH.test(req.pathname)
  );
}

export interface TileResponseShape {
  status: number;
  /** Fetch response type: "basic" | "cors" | "opaque" | ... */
  type: string;
  redirected: boolean;
}

/**
 * Tile response gate. Allows exactly:
 * - HTTP 200, type "basic" or "cors", not redirected.
 *
 * Rejects everything else, deliberately including type "opaque":
 * the 300-entry limit is ONLY valid under normal CORS quota accounting.
 * A regression to no-cors must never silently refill this cache with
 * Chromium-padded (~7MB each) opaque responses — such tiles fail to cache
 * and the map falls back to its normal offline-basemap UX instead.
 * (If Metto ever intentionally reverts to no-cors/opaque caching, that
 * change must shrink MAX_CARTO_TILES to ~20 AND re-enable opaque here.)
 */
export function isCacheableTileResponse(res: TileResponseShape): boolean {
  if (res.redirected) return false;
  if (
    res.type === "opaque" ||
    res.type === "opaqueredirect" ||
    res.type === "error"
  ) {
    return false;
  }
  return (
    res.status === 200 && (res.type === "basic" || res.type === "cors")
  );
}

/**
 * Provider-removal cleanup. If Metto ever stops using CARTO, switches
 * basemap providers, or otherwise ceases using the CARTO basemap service,
 * the release that makes that change MUST call this (e.g. from service-
 * worker activation or first app startup) so no CARTO content is retained
 * past the end of use — per §9.c ("retaining any cached map content after
 * Customer ceases to use the Basemap Services" is prohibited).
 */
export async function purgeCartoTileCache(): Promise<boolean> {
  try {
    return await caches.delete(CARTO_TILE_CACHE);
  } catch {
    return false;
  }
}
