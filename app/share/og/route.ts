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

// Dynamic OG card (1200x630) for valid share states. Level-1 content
// (station names + selected time phrase) plus a Level-1.5 schematic minimap:
// dim full network with the planned *path geometry* highlighted per line
// color (approved exception — topology only, never times/ETAs/trains).
// Invalid states never reach the renderer (metadata points them at
// /socialprev.png directly); any failure here still falls back to the static
// image with a redirect, never a crawler-facing 500.

export const alt = "مسیر مترو در متو";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Every render depends on the query (stations, pins, planned time): never
// statically optimize. Per-URL edge caching (Cache-Control below) still
// applies — this only opts out of prerendering, matching /api/mcp.
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
      renderShareCard(p.originDisplay, p.destDisplay, p.timePhrase, map),
      {
        ...size,
        fonts: [
          { name: "Vazirmatn", data: regular, style: "normal", weight: 400 },
          { name: "Vazirmatn", data: bold, style: "normal", weight: 700 },
        ],
        // Bytes are deterministic per query: edge-cacheable so repeated
        // scrapes of the same link never re-render (cost control).
        // s-maxage keeps CDN copies without revalidating the function;
        // stale-while-revalidate absorbs scrape bursts (Telegram +
        // WhatsApp + iMessage fetch the same URL within seconds).
        // Safe for timed links: `at` is an explicit instant (now-mode
        // carries no time), so a 24h TTL can never serve a stale "now".
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
