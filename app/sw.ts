/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Metto offline service worker (Serwist Configurator mode).
//
// Deterministic precaching: `serwist build` injects the real production
// manifest (hashed _next/static, prerendered HTML, public/ assets) into
// `self.__SW_MANIFEST`. No hand-maintained hashed file list.
//
// Conservative runtime policy:
// - precache: app shell + build assets + local JSON/icons (versioned)
// - CacheFirst: immutable same-origin /_next/static
// - NetworkFirst (+ offline fallback to "/"): same-origin navigations/RSC
// - NetworkFirst: /holidays.version.json update pointer (not precached)
// - NetworkOnly: same-origin /api/* and version-pinned dataset downloads
// - Cross-origin: NO blanket route — unmatched requests (Nominatim,
//   Esri, timestamp.ir, fonts, fingerprint, …) are handled directly by the
//   browser, never cached. Sole exception: the narrow opportunistic CARTO
//   raster-tile rule below (policy-bounded, see lib/map/carto-tiles.ts).
// Only cacheable responses are ever stored (no errors, no redirects).
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  registerQuotaErrorCallback,
} from "serwist";
import {
  CARTO_TILE_CACHE,
  MAX_CARTO_TILES,
  MAX_CARTO_TILE_AGE_S,
  isCacheableTileResponse,
  isCartoTileRequest,
} from "../lib/map/carto-tiles";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Tile response gate: only genuine tiles enter the cache — never
// redirects, opaqueredirects, errors, or 3xx/4xx/5xx statuses.
const cartoTileCacheGuard = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    isCacheableTileResponse({
      status: response.status,
      type: response.type,
      redirected: response.redirected,
    })
      ? response
      : null,
};

const cartoTileStrategy = new CacheFirst({
  cacheName: CARTO_TILE_CACHE,
  plugins: [
    cartoTileCacheGuard,
    new ExpirationPlugin({
      maxEntries: MAX_CARTO_TILES,
      maxAgeSeconds: MAX_CARTO_TILE_AGE_S,
      // LRU bookkeeping only; hard retention is the 30-day provider cap.
    }),
  ],
});

// Storage pressure: drop the optional tile cache first — core offline
// data (precache) is never sacrificed for basemap tiles.
registerQuotaErrorCallback(async () => {
  try {
    await caches.delete(CARTO_TILE_CACHE);
  } catch {
    // Best-effort.
  }
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Safe updates: a waiting worker NEVER takes over mid-session on its own.
  // The page shows a "new version available → refresh" banner which posts
  // { type: "SKIP_WAITING" }. See lib/offline/use-offline-readiness.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Opportunistic CARTO raster tiles the user actually viewed (Leaflet
      // <img> requests only — see isCartoTileRequest). CacheFirst: cache,
      // else network, caching only validated 200 cors/basic responses —
      // opaque is rejected so a no-cors regression can never refill this
      // 300-entry cache with quota-padded responses (see carto-tiles.ts).
      // Bounded by MAX_CARTO_TILES / MAX_CARTO_TILE_AGE_S (provider terms);
      // NOT part of offline readiness; Esri stays unmatched (network-only).
      matcher: ({ url, request, sameOrigin }) =>
        !sameOrigin &&
        isCartoTileRequest({
          hostname: url.hostname,
          pathname: url.pathname,
          method: request.method,
          destination: (request as Request).destination,
        }),
      handler: (async ({
        request,
        event,
      }: {
        request: Request;
        event: ExtendableEvent;
      }) => {
        try {
          const response = await cartoTileStrategy.handle({ request, event });
          return response ?? Response.error();
        } catch {
          // Offline cache miss (or any failure): a handled failure lets
          // Leaflet fire tileerror and show the offline-basemap banner —
          // no fake tile, no unhandled Serwist `no-response` rejection.
          return Response.error();
        }
      }),
    },
    {
      // Immutable hashed build output. Same-origin only; only GET callers
      // reach runtime caching, and only 200/basic responses are stored.
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "metto-next-static",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 128,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    {
      // Holiday version pointer: tiny, polled at startup, must revalidate
      // online (deliberately NOT precached). Offline it falls back to the
      // last runtime-cached copy; failure just keeps the current dataset.
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname === "/holidays.version.json",
      handler: new NetworkFirst({
        cacheName: "metto-holiday-version",
        networkTimeoutSeconds: 5,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 2,
            maxAgeSeconds: 7 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    {
      // Precached core datasets (schedule/holidays/icons/manifest) are
      // served deterministically by the precache route — no runtime rule
      // here, so a stale or empty runtime cache can never shadow them.
      // Version-pinned holiday downloads (`/holidays.json?v=…`) intentionally
      // bypass the precache key and always go to the network when online.
      matcher: ({ url, sameOrigin }) =>
        sameOrigin &&
        url.pathname === "/holidays.json" &&
        url.search.length > 0,
      handler: new NetworkOnly(),
    },
    {
      // Reserved same-origin API path for holiday data: never cached
      // (first matching rule wins, so keep this before navigations).
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname === "/api/holidays",
      handler: new NetworkOnly(),
    },
    {
      // Server/API routes are never part of the offline core.
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    {
      // Same-origin navigations + App Router RSC. NetworkFirst keeps
      // deployments fresh; the precached "/" fallback renders offline.
      // Only 200 basic HTML/RSC responses are stored (no errors, no
      // redirects — those would poison the cache across deploys).
      matcher: ({ request, sameOrigin, url }) => {
        if (!sameOrigin || request.method !== "GET") return false;
        if (url.pathname.startsWith("/api/")) return false;
        if (request.mode === "navigate") return true;
        const dest = (request as Request).destination;
        if (dest === "document") return true;
        // App Router client navigation (RSC payload).
        try {
          return (
            request.headers.get("RSC") === "1" ||
            request.headers.get("Next-Router-Prefetch") === "1"
          );
        } catch {
          return false;
        }
      },
      handler: new NetworkFirst({
        cacheName: "metto-pages",
        networkTimeoutSeconds: 8,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 7 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// User-controlled update: only skip waiting on explicit page request.
self.addEventListener("message", (event) => {
  const data = event.data as { type?: string } | null;
  if (data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// One-time migration: remove the legacy hand-written worker's caches so a
// stale `metto-v*` shell can never shadow the Serwist precache.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k === "metto-v3" || k.startsWith("metto-v"))
            .map((k) => caches.delete(k)),
        );
      } catch {
        // Cache cleanup is best-effort; precache integrity is unaffected.
      }
    })(),
  );
});

serwist.addEventListeners();
