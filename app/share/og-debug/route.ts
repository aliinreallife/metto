import { NextResponse } from "next/server";
import { GET as renderOg } from "../og/route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// TEMPORARY preview verification helper. Removed before merge.
export async function GET(request: Request) {
  const response = await renderOg(request);
  if (!response.ok || !response.headers.get("content-type")?.includes("image/png")) {
    return NextResponse.json(
      { status: response.status, contentType: response.headers.get("content-type") },
      { status: 502 },
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return new NextResponse(bytes.toString("base64"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
