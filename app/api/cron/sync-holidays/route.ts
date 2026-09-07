import { NextResponse } from "next/server";
import { createRedisHolidayStore } from "@/lib/holidays/store";
import { syncHolidays } from "@/lib/holidays/sync";

// Same endpoint can later run every 6h on Vercel Pro with no logic change.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured -> refuse (fail closed) rather than run open.
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await syncHolidays({
      nowMs: Date.now(),
      store: createRedisHolidayStore(),
    });
    return NextResponse.json(summary);
  } catch (err) {
    // timestamp.ir outage must not break routing; report, retain cache.
    console.error(
      JSON.stringify({
        job: "sync-holidays",
        level: "error",
        message: err instanceof Error ? err.message : "unknown",
      }),
    );
    return NextResponse.json(
      { error: "sync-failed", success: false },
      { status: 500 },
    );
  }
}
