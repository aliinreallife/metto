// @ts-check
// Serwist Configurator mode (Next 16, bundler-agnostic).
// `next build && serwist build`: Serwist runs AFTER prerendering so it can
// deterministically precache prerendered HTML + hashed _next/static assets.
// Docs: https://serwist.pages.dev/docs/next/config
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { serwist } from "@serwist/next/config";

// Revision for the dynamic /manifest.webmanifest route (not a static file,
// so Serwist cannot hash it automatically). Tied to the manifest source.
let manifestRevision = "v1";
try {
  manifestRevision = createHash("sha1")
    .update(readFileSync(new URL("./app/manifest.ts", import.meta.url)))
    .digest("hex")
    .slice(0, 12);
} catch {
  // Source unreadable — fall back to a static revision.
}

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // schedule-data.json is ~5.4MB; the Workbox default 2MB cap would skip it.
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  // Search-console verification HTML is never part of the offline core; its
  // transformed precache URL would 404 and fail the whole install.
  // holidays.version.json is intentionally NOT precached: the client polls
  // it at startup to discover dataset updates, so it must revalidate over
  // the network (runtime NetworkFirst) instead of serving a frozen copy.
  globIgnores: ["public/google*.html", "public/holidays.version.json"],
  additionalPrecacheEntries: [
    { url: "/manifest.webmanifest", revision: manifestRevision },
  ],
});
