import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import {
  buildSharePresentation,
  SHARE_STATIC_IMAGE,
} from "@/lib/route-share";
import {
  computeRouteTopology,
  estimateSegmentSeconds,
  type RouteTopology,
} from "@/lib/route";
import { renderShareCard } from "./card";

// Dynamic 1200x630 social preview for valid route-share states. The image is
// deliberately a teaser: brand + endpoints + cheap, time-independent topology
// facts. Exact timetable timing, directions, and the interactive map stay
// inside the shared route.

export const alt = "مسیر مترو در متو";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Every render depends on query labels, so never statically optimize the route.
// Per-URL CDN caching below absorbs duplicate crawler fetches.
export const dynamic = "force-dynamic";

// ImageResponse can still be relatively expensive on a cold instance because
// it loads fonts and rasterizes with Satori/resvg. The route facts below are
// synchronous/static and do not touch timetables, holidays, or external I/O.
export const maxDuration = 30;

// Vazirmatn TTFs (SIL OFL 1.1, see NOTICE.md). Read once at module scope.
// woff2 is not supported by ImageResponse, hence committed TTFs.
const regularFont = readFile(
  join(process.cwd(), "assets", "fonts", "Vazirmatn-Regular.ttf"),
);
const boldFont = readFile(
  join(process.cwd(), "assets", "fonts", "Vazirmatn-Bold.ttf"),
);
let warmed = false;

// Keep the image cache key independent of timeMode/at. This estimate mirrors
// Metto's geometry fallback: riding time from inter-station distance plus the
// known physical walk at line transfers. Waits stay out of the preview.
function estimateTopologyMinutes(topology: RouteTopology): number {
  let seconds = 0;
  for (const segment of topology.segments) {
    seconds += estimateSegmentSeconds(segment.stations);
    if (segment.changeFromPrevious.type === "line_transfer") {
      seconds += segment.changeFromPrevious.walkSeconds;
    }
  }
  return Math.max(1, Math.round(seconds / 60));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t0 = Date.now();
  try {
    const p = buildSharePresentation(url.searchParams, Date.now());
    const tPresent = Date.now() - t0;
    if (!p.valid) {
      return NextResponse.redirect(new URL(SHARE_STATIC_IMAGE, url));
    }

    // Static topology only: transfers + geometric travel duration add useful
    // context without schedule lookup, ETA calculation, holiday I/O, or map
    // geometry. Failure degrades to an endpoint-only card rather than failing.
    let numTransfers: number | null = null;
    let durationMinutes: number | null = null;
    if (p.state.from && p.state.to) {
      try {
        const topology = computeRouteTopology(p.state.from, p.state.to);
        numTransfers = topology?.numTransfers ?? null;
        durationMinutes = topology ? estimateTopologyMinutes(topology) : null;
      } catch {
        // Endpoint-only fallback is intentional.
      }
    }
    const tTopology = Date.now() - t0 - tPresent;

    const [regular, bold] = await Promise.all([regularFont, boldFont]);
    const tAssets = Date.now() - t0 - tPresent - tTopology;
    const first = !warmed;
    warmed = true;

    // PII-free operational timing only: no station slugs, labels, coordinates,
    // selected times, or query strings.
    console.log(
      `[og] first=${first ? 1 : 0} tPresent=${tPresent} ` +
        `tTopology=${tTopology} tAssets=${tAssets} ` +
        `tTotal=${Date.now() - t0}ms`,
    );

    return new ImageResponse(
      renderShareCard({
        originDisplay: p.originDisplay,
        destDisplay: p.destDisplay,
        durationMinutes,
        numTransfers,
      }),
      {
        ...size,
        fonts: [
          { name: "Vazirmatn", data: regular, style: "normal", weight: 400 },
          { name: "Vazirmatn", data: bold, style: "normal", weight: 700 },
        ],
        // Pixels remain time-independent. The image cache key is therefore
        // shared across now/depart/arrive variants of the same route.
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
