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
// - StaleWhileRevalidate: same-origin local datasets/icons/manifest
// - NetworkFirst (+ offline fallback to "/"): same-origin navigations/RSC
// - NetworkOnly: POST, /api/*, ALL cross-origin (Nominatim/Esri/CARTO/
//   timestamp.ir/fonts), failures, redirects/opaque. Never cached.
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

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
      // Holiday version check must be cheap + always revalidated online.
      // (Covered by LOCAL_DATA_RE; listed explicitly for clarity — first
      // matching rule wins in Serwist, so keep this before navigations.)
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
      // Third-party: Nominatim, Esri, CARTO, timestamp.ir, Google Fonts,
      // or anything cross-origin. Online-only by design; never cached.
      matcher: ({ sameOrigin }) => !sameOrigin,
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
