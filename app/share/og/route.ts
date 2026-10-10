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

// Satori/resvg renders take seconds (not minutes): fail fast on hangs
// instead of burning Hobby CPU/memory quotas on stuck invocations.
export const maxDuration = 10;

// Vazirmatn TTFs (SIL OFL 1.1, see NOTICE.md). Read once at module scope —
// request-independent predictable values (per Next caching guidance).
// woff2 is NOT supported by ImageResponse, hence committed TTFs.
const regularFont = readFile(
  join(process.cwd(), "assets", "fonts", "Vazirmatn-Regular.ttf"),
);
const boldFont = readFile(
  join(process.cwd(), "assets", "fonts", "Vazirmatn-Bold.ttf"),
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const p = buildSharePresentation(url.searchParams, Date.now());
    if (!p.valid) {
      return NextResponse.redirect(new URL(SHARE_STATIC_IMAGE, url));
    }
    const [regular, bold] = await Promise.all([regularFont, boldFont]);
    // Map model failures degrade to the text-only card (never null the
    // whole render — buildShareMap returns dim-only on bad topology).
    // Geometry is projected into the card's map panel (never full-canvas),
    // landmark pins drawn as markers + walk connectors to their stations.
    const map = buildShareMap(p.state.from ?? "", p.state.to ?? "", {
      viewport: OG_PANEL,
      originPin: p.state.originPin,
      destPin: p.state.destPin,
    });
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
