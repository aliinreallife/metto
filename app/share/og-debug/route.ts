import { GET as getOg } from "../og/route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Temporary preview-only raster verifier. Removed before merge.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ogUrl = new URL("/share/og", url.origin);
  const ogParams = new URLSearchParams(url.searchParams);
  ogParams.delete("offset");
  ogParams.delete("length");
  ogUrl.search = ogParams.toString();

  const response = await getOg(new Request(ogUrl));
  const bytes = Buffer.from(await response.arrayBuffer());
  const base64 = bytes.toString("base64");
  const offset = Math.max(0, Number(url.searchParams.get("offset") || "0") || 0);
  const length = Math.min(
    30000,
    Math.max(1, Number(url.searchParams.get("length") || "20000") || 20000),
  );

  return Response.json(
    {
      total: base64.length,
      offset,
      chunk: base64.slice(offset, offset + length),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
