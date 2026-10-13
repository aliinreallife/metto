import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import {
  buildSharePresentation,
  SHARE_STATIC_IMAGE,
} from "@/lib/route-share";
import { renderShareCard } from "./card";

// Dynamic 1200x630 social preview for valid route-share states. The image is
// intentionally minimal: brand + origin + destination. The share URL carries
// the complete route/timing/place state; crawlers do not need to calculate or
// rasterize metro-map geometry just to show a useful preview.

export const alt = "مسیر مترو در متو";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Every render depends on the query labels, so never statically optimize the
// route. Per-URL CDN caching below absorbs duplicate crawler fetches.
export const dynamic = "force-dynamic";

// ImageResponse can still be relatively expensive on a cold instance because
// it loads fonts and rasterizes with Satori/resvg, but removing the map model
// makes our preparation path tiny. Keep defensive headroom for platform cold
// starts rather than turning a slow crawler request into a 500.
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

    const [regular, bold] = await Promise.all([regularFont, boldFont]);
    const tAssets = Date.now() - t0 - tPresent;
    const first = !warmed;
    warmed = true;

    // PII-free operational timing only: no station slugs, labels, coordinates,
    // selected times, or query strings.
    console.log(
      `[og] first=${first ? 1 : 0} tPresent=${tPresent} tAssets=${tAssets} ` +
        `tTotal=${Date.now() - t0}ms`,
    );

    return new ImageResponse(
      renderShareCard(p.originDisplay, p.destDisplay),
      {
        ...size,
        fonts: [
          { name: "Vazirmatn", data: regular, style: "normal", weight: 400 },
          { name: "Vazirmatn", data: bold, style: "normal", weight: 700 },
        ],
        // Pixels are intentionally time-independent. The image cache key is
        // already deduped across now/depart/arrive variants of the same share.
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
