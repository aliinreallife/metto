import { NextResponse } from "next/server";

// Tiny reachability probe for effective-connectivity detection.
//
// `navigator.onLine` only reflects link state (useless with e.g. an Android
// VPN virtual interface up but Wi-Fi/cellular off), so the client verifies
// usable Internet by requesting this endpoint. Exactly HTTP 204 counts as
// reachable — anything else (redirects, auth walls, errors) does not.
//
// Deliberately boring: no DB, no Redis, no external calls, no auth, no
// body, no analytics, no side effects. `Cache-Control: no-store` plus the
// service worker's existing NetworkOnly `/api/*` rule mean no layer may
// ever satisfy this from cache — every success proves a live round trip.
export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
