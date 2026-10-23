import { mashhadPreviewEnabled } from "@/lib/mashhad-preview-access";
import { mashhadPreview } from "@/lib/mashhad-preview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!mashhadPreviewEnabled()) return Response.json({ error: "not_found" }, { status: 404, headers });
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== "from" && key !== "to")) {
    return Response.json({ error: "unsupported_parameters", timing: "unavailable" }, { status: 400, headers });
  }
  const from = params.get("from") ?? "", to = params.get("to") ?? "";
  if (!mashhadPreview.stations.some(s => s.id === from) || !mashhadPreview.stations.some(s => s.id === to) || from === to) {
    return Response.json({ error: "invalid_stations" }, { status: 400, headers });
  }
  const path = mashhadPreview.findPath(from, to);
  return Response.json({ cityId: "mashhad", reviewOnly: true, timing: "unavailable", route: path }, { headers });
}
