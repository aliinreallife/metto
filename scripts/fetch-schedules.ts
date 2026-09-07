#!/usr/bin/env npx tsx
/**
 * Downloads all schedule CSVs from metro-yab.ir, parses them,
 * and generates lib/schedule-data.ts with structured schedule data.
 *
 * Usage: npx tsx scripts/fetch-schedules.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";

const BASE_URL = "https://metro-yab.ir/data/schedules";

// All CSV files to fetch: [dayType, filename]
const CSV_FILES: [string, string][] = [
  // L1
  ["saturday_wednesday", "l1_Tajrish.csv"],
  ["saturday_wednesday", "l1_Kahrizak.csv"],
  ["thursday", "l1_Tajrish.csv"],
  ["thursday", "l1_Kahrizak.csv"],
  ["friday", "l1_Tajrish.csv"],
  ["friday", "l1_Kahrizak.csv"],
  // L1w (branch)
  ["saturday_wednesday", "l1w_Shahed-Bagher%20Shahr.csv"],
  ["saturday_wednesday", "l1w_Shahr-e%20Parand.csv"],
  ["thursday", "l1w_Shahed-Bagher%20Shahr.csv"],
  ["thursday", "l1w_Shahr-e%20Parand.csv"],
  ["friday", "l1w_Shahed-Bagher%20Shahr.csv"],
  ["friday", "l1w_Shahr-e%20Parand.csv"],
  // L2
  ["saturday_wednesday", "l2_Farhangsara.csv"],
  ["saturday_wednesday", "l2_Tehran%20(Sadeghiyeh).csv"],
  ["thursday", "l2_Farhangsara.csv"],
  ["thursday", "l2_Tehran%20(Sadeghiyeh).csv"],
  ["friday", "l2_Farhangsara.csv"],
  ["friday", "l2_Tehran%20(Sadeghiyeh).csv"],
  // L3
  ["saturday_wednesday", "l3_Gha'em.csv"],
  ["saturday_wednesday", "l3_Azadegan.csv"],
  ["thursday", "l3_Gha'em.csv"],
  ["thursday", "l3_Azadegan.csv"],
  ["friday", "l3_Gha'em.csv"],
  ["friday", "l3_Azadegan.csv"],
  // L4
  ["saturday_wednesday", "l4_Shahid%20Kolahdouz.csv"],
  ["saturday_wednesday", "l4_Allameh%20Jafari.csv"],
  ["thursday", "l4_Shahid%20Kolahdouz.csv"],
  ["thursday", "l4_Allameh%20Jafari.csv"],
  ["friday", "l4_Shahid%20Kolahdouz.csv"],
  ["friday", "l4_Allameh%20Jafari.csv"],
  // L4s (branch)
  ["saturday_wednesday", "l4s_Bimeh.csv"],
  ["saturday_wednesday", "l4s_Mehrabad%20Airport%20Terminal%204&6.csv"],
  ["thursday", "l4s_Bimeh.csv"],
  ["thursday", "l4s_Mehrabad%20Airport%20Terminal%204&6.csv"],
  ["friday", "l4s_Bimeh.csv"],
  ["friday", "l4s_Mehrabad%20Airport%20Terminal%204&6.csv"],
  // L5
  ["saturday_wednesday", "l5_Tehran%20(Sadeghiyeh).csv"],
  ["saturday_wednesday", "l5_Golshahr.csv"],
  ["thursday", "l5_Tehran%20(Sadeghiyeh).csv"],
  ["thursday", "l5_Golshahr.csv"],
  ["friday", "l5_Tehran%20(Sadeghiyeh).csv"],
  ["friday", "l5_Golshahr.csv"],
  // L5w (branch)
  ["saturday_wednesday", "l5w_Golshahr.csv"],
  ["saturday_wednesday", "l5w_Shahid%20Sepahbod%20Ghasem%20Soleimani.csv"],
  ["thursday", "l5w_Golshahr.csv"],
  ["thursday", "l5w_Shahid%20Sepahbod%20Ghasem%20Soleimani.csv"],
  ["friday", "l5w_Golshahr.csv"],
  ["friday", "l5w_Shahid%20Sepahbod%20Ghasem%20Soleimani.csv"],
  // L6
  ["saturday_wednesday", "l6_Shohada-ye%20Dowlat%20Abad.csv"],
  ["saturday_wednesday", "l6_Shahid%20Arman%20Aliverdi%20(Kohsar).csv"],
  ["thursday", "l6_Shohada-ye%20Dowlat%20Abad.csv"],
  ["thursday", "l6_Shahid%20Arman%20Aliverdi%20(Kohsar).csv"],
  ["friday", "l6_Shohada-ye%20Dowlat%20Abad.csv"],
  ["friday", "l6_Shahid%20Arman%20Aliverdi%20(Kohsar).csv"],
  // L7
  ["saturday_wednesday", "l7_Varzeshgah-e%20Takhti.csv"],
  ["saturday_wednesday", "l7_Meydan-e%20Ketab.csv"],
  ["thursday", "l7_Varzeshgah-e%20Takhti.csv"],
  ["thursday", "l7_Meydan-e%20Ketab.csv"],
  ["friday", "l7_Varzeshgah-e%20Takhti.csv"],
  ["friday", "l7_Meydan-e%20Ketab.csv"],
];

// Extract line number from filename (e.g. "l5_Golshahr" → 5, "l5w_Golshahr" → 5)
function lineFromFilename(filename: string): number {
  const m = filename.match(/^l(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// Is this a branch line? (filename contains 'w' or 's' after the number)
function isBranch(filename: string): boolean {
  return /^l\d+[ws]_/.test(filename);
}

// Normalize Persian text for matching: remove whitespace variations, normalize characters
function normalize(s: string): string {
  return s
    .replace(/\u200c/g, " ") // zero-width non-joiner → space
    .replace(/\u200d/g, "") // zero-width joiner → remove
    .replace(/\u0640/g, "") // tatweel → remove
    .replace(/[ي]/g, "ی") // Arabic yeh → Persian yeh
    .replace(/[ك]/g, "ک") // Arabic kaf → Persian kaf
    .replace(/\s+/g, " ")
    .trim();
}

// Manual overrides for Persian name mismatches between CSVs and database
const NAME_OVERRIDES: Record<string, string> = {
  // CSV name → station ID
  "شهید هفتم تیر": "shohada-ye-haftom-e-tir",
  "پایانه جنوب": "payaneh-jonoub-jonoub-terminal",
  "شهید بخارایی": "shahid-bokharaei",
  "شاهد - باقرشهر": "shahed-baghershahr",
  "حرم مطهر امام خمینی": "holy-shrine-of-imam-khomeini",
  "پایانه ۱ و ۲ فرودگاه مهرآباد": "mehrabad-airport-terminal-1-2",
  "پایانه ۴ و ۶ فرودگاه مهرآباد": "mehrabad-airport-terminal-4-6",
  "پایانه 1 و 2 فرودگاه مهرآباد": "mehrabad-airport-terminal-1-2",
  "پایانه 4 و 6 فرودگاه مهرآباد": "mehrabad-airport-terminal-4-6",
  "شهید سپهبد قاسم سلیمانی": "shahid-sepahbod-qasem-soleimani",
  "شهید فخری زاده": "shahid-fakhrizade",
  // Additional mismatches found during parsing
  "شهرری": "shahr-e-rey",
  "میرزای شیرازی": "mirza-ye-shirazi",
  "دکتر حبیب اله": "doctor-habibollah",
  "نیرو هوایی": "nirou-havaei",
  "پایانه 4و6 فرودگاه مهرآباد": "mehrabad-airport-terminal-4-6",
  "پایانه 1و2 فرودگاه مهرآباد": "mehrabad-airport-terminal-1-2",
  "محمد شهر": "mohammadshahr",
  "شهرزیبا": "shahr-e-ziba",
};

// Build station fa→slug mapping from the normalized metro dataset.
async function buildStationMap(): Promise<Map<string, string>> {
  const { STATIONS } = await import("../lib/metro/stations");
  const map = new Map<string, string>();
  for (const s of STATIONS) map.set(normalize(s.name.fa), s.id);
  return map;
}

// Parse a CSV string into structured data
function parseCSV(
  csv: string,
  filename: string,
  dayType: string,
  stationMap: Map<string, string>
): {
  line: number;
  direction: string;
  dayType: string;
  isBranch: boolean;
  trains: { stops: { stationId: string; time: string }[] }[];
  unmappedStations: string[];
} {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return { line: 0, direction: "", dayType, isBranch: false, trains: [], unmappedStations: [] };
  }

  const lineNum = lineFromFilename(filename);
  const branch = isBranch(filename);

  // First row: station names in Persian
  const stationNames = lines[0].split(",").map((s) => s.trim());

  // Map Persian names to IDs
  const unmappedStations: string[] = [];
  const stationIds: (string | null)[] = stationNames.map((name) => {
    // Try manual override first
    const override = NAME_OVERRIDES[name];
    if (override) return override;
    // Try exact match
    const id = stationMap.get(normalize(name));
    if (id) return id;
    // Try partial match (some names have extra text)
    for (const [faName, faId] of stationMap) {
      if (faName.includes(normalize(name)) || normalize(name).includes(faName)) {
        return faId;
      }
    }
    unmappedStations.push(name);
    return null;
  });

  // Direction = first station with a valid ID (the starting terminal)
  const direction = stationIds.find((id) => id !== null) ?? "";

  // Remaining rows: train schedules
  const trains: { stops: { stationId: string; time: string }[] }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const stops: { stationId: string; time: string }[] = [];
    for (let j = 0; j < cells.length; j++) {
      const time = cells[j]?.trim();
      const stationId = stationIds[j];
      if (time && stationId) {
        stops.push({ stationId, time });
      }
    }
    if (stops.length > 0) {
      trains.push({ stops });
    }
  }

  return { line: lineNum, direction, dayType, isBranch: branch, trains, unmappedStations };
}

async function fetchCSV(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Detect if a train is express (skips stations relative to the full route)
// Only Line 5 trains (in either direction) that skip stations are considered express
function isExpress(
  train: { stops: { stationId: string; time: string }[] },
  fullRouteStations: string[],
  line: number,
  direction: string,
): boolean {
  // Only Line 5 has express trains
  if (line !== 5) return false;
  // Only Golshahr and Tehran (Sadeghiyeh) are L5 terminals
  if (direction !== "tehran-sadeghiyeh" && direction !== "golshahr") return false;

  if (train.stops.length >= fullRouteStations.length) return false;
  // Check if the train skips any intermediate stations
  const trainStationIds = new Set(train.stops.map((s) => s.stationId));
  for (let i = 1; i < fullRouteStations.length - 1; i++) {
    if (!trainStationIds.has(fullRouteStations[i])) return true;
  }
  return false;
}

// Time string to minutes since midnight
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Generate TypeScript code for schedule data
function generateScheduleTS(
  allParsed: ReturnType<typeof parseCSV>[],
  fullRoutes: Map<string, string[]>
): string {
  let ts = `// Auto-generated by scripts/fetch-schedules.ts
// Do not edit manually. Run \`npx tsx scripts/fetch-schedules.ts\` to regenerate.

export type DayType = "saturday_wednesday" | "thursday" | "friday";

export type TrainStop = {
  stationId: string;
  time: string; // "HH:MM"
};

export type TrainSchedule = {
  line: number;
  direction: string; // terminal station ID (direction of travel)
  dayType: DayType;
  isExpress: boolean;
  stops: TrainStop[];
};

export type LineScheduleData = {
  line: number;
  terminalA: string;
  terminalB: string;
  isBranch: boolean;
  scheduleKey: string; // e.g. "5" or "5w"
  trains: TrainSchedule[];
};

`;

  // Group by line + direction + dayType
  type TS = { line: number; direction: string; dayType: string; isExpress: boolean; stops: { stationId: string; time: string }[] };
  const grouped = new Map<string, TS[]>();
  const lineInfo = new Map<string, { line: number; terminalA: string; terminalB: string; isBranch: boolean }>();

  for (const parsed of allParsed) {
    if (parsed.line === 0) continue;

    // Determine the full route for express detection
    const routeKey = `${parsed.line}_${parsed.direction}`;
    const fullRoute = fullRoutes.get(routeKey) ?? parsed.trains[0]?.stops.map((s) => s.stationId) ?? [];

    const trains: TS[] = parsed.trains.map((t) => ({
      line: parsed.line,
      direction: t.stops[t.stops.length - 1]?.stationId ?? parsed.direction,
      dayType: parsed.dayType,
      isExpress: isExpress(t, fullRoute, parsed.line, t.stops[t.stops.length - 1]?.stationId ?? parsed.direction),
      stops: t.stops,
    }));

    // Group trains by direction
    const dirKey = `${parsed.line}_${parsed.direction}`;
    if (!grouped.has(dirKey)) grouped.set(dirKey, []);
    grouped.get(dirKey)!.push(...trains);

    // Store line info
    const stops = parsed.trains[0]?.stops.map((s) => s.stationId) ?? [];
    if (!lineInfo.has(dirKey)) {
      lineInfo.set(dirKey, {
        line: parsed.line,
        terminalA: parsed.direction,
        terminalB: stops[stops.length - 1] ?? "",
        isBranch: parsed.isBranch,
      });
    }
  }

  // Generate arrays
  ts += `export const LINE_SCHEDULES: LineScheduleData[] = [\n`;

  for (const [dirKey, trains] of grouped) {
    const info = lineInfo.get(dirKey)!;
    const scheduleKey = info.isBranch ? `${info.line}w` : `${info.line}`;
    ts += `  {\n`;
    ts += `    line: ${info.line},\n`;
    ts += `    terminalA: "${info.terminalA}",\n`;
    ts += `    terminalB: "${info.terminalB}",\n`;
    ts += `    isBranch: ${info.isBranch},\n`;
    ts += `    scheduleKey: "${scheduleKey}",\n`;
    ts += `    trains: [\n`;

    for (const train of trains) {
      ts += `      { line: ${train.line}, direction: "${train.direction}", dayType: "${train.dayType}", isExpress: ${train.isExpress}, stops: [`;
      for (const stop of train.stops) {
        ts += `{ stationId: "${stop.stationId}", time: "${stop.time}" },`;
      }
      ts += `] },\n`;
    }

    ts += `    ],\n`;
    ts += `  },\n`;
  }

  ts += `];\n`;

  return ts;
}

async function main() {
  console.log("Fetching schedule CSVs from metro-yab.ir...\n");

  const stationMap = await buildStationMap();
  console.log(`Loaded ${stationMap.size} station name mappings from lib/metro/stations`);

  const allParsed: ReturnType<typeof parseCSV>[] = [];
  const allUnmapped = new Set<string>();
  let successCount = 0;
  let failCount = 0;

  for (const [dayType, filename] of CSV_FILES) {
    const url = `${BASE_URL}/${dayType}/${filename}`;
    const csv = await fetchCSV(url);
    if (!csv) {
      console.log(`  FAILED: ${filename} (${dayType})`);
      failCount++;
      continue;
    }
    successCount++;
    const parsed = parseCSV(csv, filename, dayType, stationMap);
    allParsed.push(parsed);

    // Collect unmapped stations
    for (const name of parsed.unmappedStations) {
      allUnmapped.add(name);
    }

    // Log stats
    const expressCount = parsed.trains.filter((t) => {
      const route = parsed.trains[0]?.stops.map((s) => s.stationId) ?? [];
      const dest = t.stops[t.stops.length - 1]?.stationId ?? "";
      return isExpress(t, route, parsed.line, dest);
    }).length;
    console.log(
      `  OK: ${filename} (${dayType}) — ${parsed.trains.length} trains, ${expressCount} express`
    );
  }

  console.log(`\nFetched: ${successCount} OK, ${failCount} failed`);

  if (allUnmapped.size > 0) {
    console.log(`\n⚠️  Unmapped Persian station names (${allUnmapped.size}):`);
    for (const name of allUnmapped) {
      console.log(`  - "${name}"`);
    }
    console.log("\nAdd these to NAME_OVERRIDES or STATIONS in lib/metro/stations.ts.\n");
  }

  // Build full routes for express detection
  const fullRoutes = new Map<string, string[]>();
  for (const parsed of allParsed) {
    if (parsed.line === 0 || parsed.trains.length === 0) continue;
    const routeKey = `${parsed.line}_${parsed.direction}`;
    // Use the train with most stops as the full route
    const longest = parsed.trains.reduce((best, t) =>
      t.stops.length > best.stops.length ? t : best
    );
    if (!fullRoutes.has(routeKey)) {
      fullRoutes.set(routeKey, longest.stops.map((s) => s.stationId));
    }
  }

  // Generate output
  const ts = generateScheduleTS(allParsed, fullRoutes);
  const outPath = join(__dirname, "../lib/schedule-data.ts");
  writeFileSync(outPath, ts, "utf8");
  console.log(`\nGenerated ${outPath}`);

  // Print summary
  const totalTrains = allParsed.reduce((sum, p) => sum + p.trains.length, 0);
  console.log(`Total trains: ${totalTrains}`);
}

main().catch(console.error);
