import { GET as getOg } from "../og/route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Temporary preview-only raster verifier. Removed before merge.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ogUrl = new URL("/share/og", url.origin);
  ogUrl.search = url.search;
  const response = await getOg(new Request(ogUrl));
  const bytes = Buffer.from(await response.arrayBuffer());
  return new Response(bytes.toString("base64"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
