import { NextRequest, NextResponse } from "next/server";
import { STATIONS, LINE_COLORS } from "@/lib/metro-data";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const line = searchParams.get("line");
  const search = searchParams.get("search");

  let results = STATIONS;

  if (line) {
    const lineNum = parseInt(line, 10);
    if (!Number.isFinite(lineNum)) {
      return NextResponse.json({ error: "Invalid line number" }, { status: 400 });
    }
    results = results.filter((s) => s.lines.includes(lineNum));
  }

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (s) => s.name.toLowerCase().includes(q) || s.fa.includes(search),
    );
  }

  return NextResponse.json({
    count: results.length,
    lines: Object.keys(LINE_COLORS).map(Number).sort((a, b) => a - b),
    stations: results.map((s) => ({
      id: s.id,
      name: s.name,
      fa: s.fa,
      lines: s.lines,
      lat: s.lat,
      lng: s.lng,
      amenities: s.amenities,
    })),
  });
}
