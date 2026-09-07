import { NextRequest, NextResponse } from "next/server";
import { getAllStations, getStationLines } from "@/lib/metro/selectors";
import { LINES } from "@/lib/metro/lines";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const line = searchParams.get("line");
  const search = searchParams.get("search");

  let results = getAllStations();

  if (line) {
    const lineNum = parseInt(line, 10);
    if (!Number.isFinite(lineNum)) {
      return NextResponse.json({ error: "Invalid line number" }, { status: 400 });
    }
    results = results.filter((s) => getStationLines(s.id).includes(lineNum));
  }

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (s) =>
        s.name.en.toLowerCase().includes(q) || s.name.fa.includes(search),
    );
  }

  return NextResponse.json({
    count: results.length,
    lines: LINES.map((l) => l.id),
    stations: results.map((s) => ({
      id: s.id,
      name: s.name.en,
      fa: s.name.fa,
      lines: getStationLines(s.id),
      lat: s.location.lat,
      lng: s.location.lng,
      status: s.status,
      amenities: s.amenities,
    })),
  });
}
