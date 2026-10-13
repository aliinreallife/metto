import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import {
  buildSharePresentation,
  SHARE_STATIC_IMAGE,
} from "@/lib/route-share";
import { computeRouteTopology } from "@/lib/route";
import { renderShareCard } from "./card";

// Dynamic 1200x630 social preview for valid route-share states. The image is
// deliberately a teaser: brand + endpoints + cheap, time-independent topology
// facts. Exact timing, directions, and the map stay inside the shared route.

export const alt = "مسیر مترو در متو";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Every render depends on query labels, so never statically optimize the
// route. Per-URL CDN caching below absorbs duplicate crawler fetches.
export const dynamic = "force-dynamic";

// ImageResponse can still be relatively expensive on a cold instance because
// it loads fonts and rasterizes with Satori/resvg. The topology summary below
// is synchronous/static and does not touch timetables or external services.
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t0 = Date.now();
  try {
    const p = buildSharePresentation(url.searchParams, Date.now());
    const tPresent = Date.now() - t0;
    if (!p.valid) {
      return NextResponse.redirect(new URL(SHARE_STATIC_IMAGE, url));
    }

    // Static topology only: stops/transfers add useful context without doing
    // schedule lookup, ETA calculation, holiday I/O, or map geometry. Failure
    // degrades to an endpoint-only card rather than failing the OG request.
    let numStops: number | null = null;
    let numTransfers: number | null = null;
    if (p.state.from && p.state.to) {
      try {
        const topology = computeRouteTopology(p.state.from, p.state.to);
        numStops = topology?.numStops ?? null;
        numTransfers = topology?.numTransfers ?? null;
      } catch {
        // Text-only fallback is intentional.
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
        numStops,
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
