import { GET as getPreview } from "../og-debug/route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Temporary helper for pulling the visual-verification thumbnail losslessly.
// Removed before merge together with /share/og-debug.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const previewUrl = new URL("/share/og-debug", url.origin);
  const params = new URLSearchParams(url.searchParams);
  const offset = Math.max(0, Number(params.get("offset") || "0") || 0);
  const length = Math.min(1200, Math.max(1, Number(params.get("length") || "1000") || 1000));
  params.delete("offset");
  params.delete("length");
  previewUrl.search = params.toString();
  const preview = await getPreview(new Request(previewUrl));
  const base64 = await preview.text();
  return Response.json({ total: base64.length, offset, chunk: base64.slice(offset, offset + length) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
