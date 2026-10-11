import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import {
  buildSharePresentation,
  SHARE_STATIC_IMAGE,
} from "@/lib/route-share";
import { renderShareCard } from "./card";
import { buildShareMap, OG_PANEL } from "./map";

// Dynamic 1200x630 social preview for valid route-share states. The image is
// deliberately glanceable: origin, destination, lines used, and a topology-only
// minimap. Timing/stops/transfers remain in the share URL and inside Metto, not
// in the crawler image. Invalid states redirect to the static fallback; any
// render/model failure still never becomes a crawler-facing 500.

export const alt = "مسیر مترو در متو";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Every render depends on the query (stations and optional landmark pins), so
// never statically optimize the route. Per-URL edge caching still applies.
export const dynamic = "force-dynamic";

// Cold Satori/resvg renders take seconds: keep headroom so a slow cold
// start serves a stale-while-revalidate refresh instead of a platform kill.
// Cache-key dedupe (time-free image URLs) + map-node pruning do the real
// cost control; this guard is only the backstop.
export const maxDuration = 30;

// Vazirmatn TTFs (SIL OFL 1.1, see NOTICE.md). Read once at module scope —
// request-independent predictable values (per Next caching guidance).
// woff2 is NOT supported by ImageResponse, hence committed TTFs.
const regularFont = readFile(
  join(process.cwd(), "assets", "fonts", "Vazirmatn-Regular.ttf"),
);
const boldFont = readFile(
  join(process.cwd(), "assets", "fonts", "Vazirmatn-Bold.ttf"),
);

// First-request-this-instance flag: distinguishes cold-ish expensive calls
// from warm ones in logs. Process-local only (lost on scale-out/restart).
let warmed = false;

export async function GET(request: Request) {
  const url = new URL(request.url);
  // Phase timings (ms, handler scope only). NOTE: Satori layout + resvg
  // rasterization happen while Next serializes the returned ImageResponse,
  // AFTER this handler returns — that dominant cost is NOT measurable here.
  // These numbers are a lower bound ("time until we handed the render job
  // to the framework", not time-to-bytes): good for spotting regressions
  // in our own preparation path, NOT for proving end-to-end duration.
  // Actual invocation duration and timeout behavior must be read from
  // Vercel observability; maxDuration=30 stays defensive headroom until
  // production telemetry confirms total cold-render duration.
  const t0 = Date.now();
  try {
    const p = buildSharePresentation(url.searchParams, Date.now());
    const tPresent = Date.now() - t0;
    if (!p.valid) {
      return NextResponse.redirect(new URL(SHARE_STATIC_IMAGE, url));
    }
    const [regular, bold] = await Promise.all([regularFont, boldFont]);
    const tAssets = Date.now() - t0 - tPresent;
    // Map model failures degrade to the text-only card (never null the
    // whole render — buildShareMap returns dim-only on bad topology).
    // Geometry is projected into the card's map panel (never full-canvas),
    // landmark pins drawn as markers + walk connectors to their stations.
    const map = buildShareMap(p.state.from ?? "", p.state.to ?? "", {
      viewport: OG_PANEL,
      originPin: p.state.originPin,
      destPin: p.state.destPin,
    });
    const tMap = Date.now() - t0 - tPresent - tAssets;
    // Deliberately PII-free: counts and durations only — no slugs, coords,
    // labels, times, or query strings. OG traffic is crawler-driven and
    // low-volume, so one line per render is safe.
    const first = !warmed;
    warmed = true;
    const edges = map?.edges.length ?? -1;
    let hot = 0;
    if (map) {
      for (const e of map.edges) if (e.opacity === 1) hot++;
    }
    console.log(
      `[og] first=${first ? 1 : 0} pins=${p.state.originPin || p.state.destPin ? 1 : 0} ` +
        `edges=${edges} hot=${hot} ` +
        `tPresent=${tPresent} tAssets=${tAssets} tMap=${tMap} tTotal=${Date.now() - t0}ms`,
    );
    return new ImageResponse(
      renderShareCard(p.originDisplay, p.destDisplay, map),
      {
        ...size,
        fonts: [
          { name: "Vazirmatn", data: regular, style: "normal", weight: 400 },
          { name: "Vazirmatn", data: bold, style: "normal", weight: 700 },
        ],
        // The card intentionally does NOT render p.timePhrase, so its pixels
        // no longer depend on relative today/tomorrow wording or Date.now().
        // The route/pins are deterministic per URL and safe to edge-cache.
        // SWR absorbs duplicate social-crawler fetches without changing the
        // user-visible journey state when the link is opened in Metto.
        headers: {
          "Cache-Control":
            "public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return NextResponse.redirect(new URL(SHARE_STATIC_IMAGE, url));
  }
}
