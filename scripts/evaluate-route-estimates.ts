import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { estimateSegmentSeconds, STATION_MAP, findRoute } from "../lib/route";
import { remapScheduleIds, setServerScheduleData, findTripDetailed } from "../lib/schedule-utils";
import { ROUTES } from "../lib/metro/routes";
import { parseServiceTimeToMinutes } from "../lib/tehran-time";
import { TIMED_PAIRS, TIMED_SCENARIOS } from "../test-fixtures/tehran-parity";
import type { LineScheduleData } from "../lib/schedule-data";

// Mask all time information from each observed span. Expand skipped stops
// through the line graph, just as the fallback uses the infrastructure path.
// Each line/direction/day type/express flag/ordered path gets one vote, using
// its median scheduled duration, so repeated train runs do not inflate accuracy.
const source = readFileSync("public/schedule-data.json");
const schedules = remapScheduleIds(JSON.parse(source.toString()) as LineScheduleData[]);
const branchRoutes: Record<string, string> = { "1w": "line-1-parand", "4w": "line-4-mehrabad" };
type Sample = { line: number; branch: string; direction: string; dayType: string;
  express: boolean; from: string; to: string; hops: number; estimateSeconds: number;
  observations: number; durations: Map<number, number> };
const samples = new Map<string, Sample>();
const excluded = { unknownStationTrains: 0, nonIncreasingTimeTrains: 0, inconsistentTopologySpans: 0 };
let trainCount = 0, spanObservations = 0, candidateSpanObservations = 0;
const topologyExamples = new Map<string, string>();
for (const ls of schedules) for (const train of ls.trains) {
  trainCount++;
  if (train.stops.some(s => !STATION_MAP.has(s.stationId))) { excluded.unknownStationTrains++; continue; }
  const minutes = train.stops.map(s => parseServiceTimeToMinutes(s.time));
  if (minutes.some((m, i) => !Number.isFinite(m) || (i > 0 && m <= minutes[i - 1]))) {
    excluded.nonIncreasingTimeTrains++; continue;
  }
  const route = ROUTES.find(r => r.lineId === ls.line &&
    (branchRoutes[ls.scheduleKey] ? r.id === branchRoutes[ls.scheduleKey] : !r.branchId));
  if (!route) throw Error(`No route for ${ls.scheduleKey}`);
  const ordered = route.stops.map(s => s.stationId);
  const positions = train.stops.map(s => ordered.indexOf(s.stationId));
  for (let i = 0; i < train.stops.length - 1; i++) for (let j = i + 1; j < train.stops.length; j++) {
    candidateSpanObservations++;
    const indices = positions.slice(i, j + 1), direction = Math.sign(indices.at(-1)! - indices[0]);
    // A legacy name can resolve to the wrong physical station. Reject spans
    // that leave their branch, reverse, or repeat a station; never silently
    // repair timetable identity just to make this benchmark look better.
    if (!direction || indices.some((position, index) => position < 0 || (index > 0 && Math.sign(position - indices[index - 1]) !== direction))) {
      excluded.inconsistentTopologySpans++;
      if (topologyExamples.size < 8) topologyExamples.set(`${ls.scheduleKey}:${train.stops[i].stationId}:${train.stops[j].stationId}`,
        train.stops.slice(i, j + 1).map(s => s.stationId).join(" → "));
      continue;
    }
    const path = direction > 0 ? ordered.slice(indices[0], indices.at(-1)! + 1) : ordered.slice(indices.at(-1)!, indices[0] + 1).reverse();
    const key = [ls.line, ls.scheduleKey, train.direction, train.dayType, train.isExpress, ...path].join("|");
    let sample = samples.get(key);
    if (!sample) {
      sample = { line: ls.line, branch: ls.scheduleKey, direction: train.direction,
        dayType: train.dayType, express: train.isExpress, from: path[0], to: path.at(-1)!,
        hops: path.length - 1, estimateSeconds: estimateSegmentSeconds(path), observations: 0, durations: new Map() };
      samples.set(key, sample);
    }
    const seconds = (minutes[j] - minutes[i]) * 60;
    sample.durations.set(seconds, (sample.durations.get(seconds) ?? 0) + 1);
    sample.observations++; spanObservations++;
  }
}
function medianHistogram(histogram: Map<number, number>) {
  const entries = [...histogram].sort((a, b) => a[0] - b[0]);
  const count = entries.reduce((n, [, weight]) => n + weight, 0);
  const at = (rank: number) => { let total = 0; for (const [value, weight] of entries) { total += weight; if (total > rank) return value; } throw Error("Empty histogram"); };
  return (at(Math.floor((count - 1) / 2)) + at(Math.floor(count / 2))) / 2;
}
const rows = [...samples.values()].map(({ durations, ...sample }) => {
  const actualSeconds = medianHistogram(durations);
  return { ...sample, actualSeconds, errorSeconds: sample.estimateSeconds - actualSeconds };
});
type Row = typeof rows[number];
function summary(group: Pick<Row, "errorSeconds" | "actualSeconds">[]) {
  const abs = group.map(r => Math.abs(r.errorSeconds)).sort((a, b) => a - b);
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const quantile = (p: number) => abs[Math.max(0, Math.ceil(abs.length * p) - 1)];
  const rounded = (n: number) => Math.round(n * 100) / 100;
  return { samples: group.length, meanAbsoluteErrorSeconds: rounded(mean(abs)),
    medianAbsoluteErrorSeconds: quantile(.5), p90AbsoluteErrorSeconds: quantile(.9),
    meanBiasSeconds: rounded(mean(group.map(r => r.errorSeconds))),
    meanAbsolutePercentError: rounded(mean(group.map(r => 100 * Math.abs(r.errorSeconds) / r.actualSeconds))),
    withinOneMinutePercent: rounded(100 * abs.filter(e => e <= 60).length / abs.length),
    withinFiveMinutesPercent: rounded(100 * abs.filter(e => e <= 300).length / abs.length) };
}
const regular = rows.filter(r => !r.express);
// Exercise the real route ledger as well as the geometric ride function.
// The existing, pre-migration scenario matrix includes branches, holidays,
// last service and midnight. Do not treat guessed service as a real train.
setServerScheduleData(schedules);
const journeys: { scenario: string; from: string; to: string; masked: string;
  actualSeconds: number; estimateSeconds: number; errorSeconds: number }[] = [];
const journeyCoverage = { requested: 0, fullyTimedBaseline: 0, inconsistentBaseline: 0,
  noServiceBaseline: 0, otherBaseline: 0, maskedNoService: 0, pathChanged: 0,
  fullyMaskedClaimsJourneyWhenBaselineHasNoService: 0 };
for (const scenario of TIMED_SCENARIOS) for (const [from, to] of TIMED_PAIRS) {
  journeyCoverage.requested++;
  const options = { departAt: new Date(scenario.at), isHolidayDate: () => scenario.holiday };
  const actual = findRoute(from, to, options);
  if (actual?.status === "no_service") {
    journeyCoverage.noServiceBaseline++;
    const masked = findRoute(from, to, { ...options, tripLookup: () => ({ status: "missing_schedule_data" }) });
    if (masked?.status === "complete") journeyCoverage.fullyMaskedClaimsJourneyWhenBaselineHasNoService++;
    continue;
  }
  if (!actual || actual.legTiming.some(t => t !== "timetable")) { journeyCoverage.otherBaseline++; continue; }
  const consistent = actual.segments.every((segment, i) => {
    const stops = actual.trips[i]!.train.stops;
    const fromIndex = stops.findIndex(s => s.stationId === segment.stations[0]);
    const toIndex = stops.findIndex(s => s.stationId === segment.stations.at(-1));
    const positions = stops.slice(fromIndex, toIndex + 1).map(s => segment.stations.indexOf(s.stationId));
    return fromIndex >= 0 && toIndex > fromIndex && positions.every((p, j) => p >= 0 && (j === 0 || p > positions[j - 1]));
  });
  if (!consistent) { journeyCoverage.inconsistentBaseline++; continue; }
  journeyCoverage.fullyTimedBaseline++;
  for (const mask of ["all", ...actual.segments.map((_, i) => String(i))]) {
    const segment = mask === "all" ? undefined : actual.segments[Number(mask)];
    const estimate = findRoute(from, to, { ...options, tripLookup: args => {
      if (!segment || (args.line === segment.line && args.fromId === segment.stations[0] && args.toId === segment.stations.at(-1))) return { status: "missing_schedule_data" };
      return findTripDetailed(args.fromId, args.toId, args.line, args.afterMinutes, args.dayType);
    } });
    if (!estimate || estimate.status !== "complete") { journeyCoverage.maskedNoService++; continue; }
    if (estimate.path.join("|") !== actual.path.join("|")) { journeyCoverage.pathChanged++; continue; }
    journeys.push({ scenario: scenario.name, from, to, masked: mask, actualSeconds: actual.estimatedSeconds,
      estimateSeconds: estimate.estimatedSeconds, errorSeconds: estimate.estimatedSeconds - actual.estimatedSeconds });
  }
}
const report = {
  scheduleSha256: createHash("sha256").update(source).digest("hex"),
  formula: "Production estimateSegmentSeconds: sum of haversine hop distance / 35 km/h + 25 seconds per hop; rounded once per span",
  unit: "One line/branch/direction/day type/express flag/ordered span, median scheduled ride duration across repeated trains",
  trainCount, candidateSpanObservations, spanObservations, excluded, topologyExamples: Object.fromEntries(topologyExamples),
  journeys: { coverage: journeyCoverage,
    allTimetablesMasked: summary(journeys.filter(r => r.masked === "all")),
    oneLegMasked: summary(journeys.filter(r => r.masked !== "all")),
    cases: journeys },
  regular: summary(regular), express: summary(rows.filter(r => r.express)),
  byBranch: Object.fromEntries([...new Set(regular.map(r => r.branch))].map(branch => [branch, summary(regular.filter(r => r.branch === branch))])),
  byDirection: Object.fromEntries([...new Set(regular.map(r => `${r.branch}:${r.direction}`))].map(key => [key, summary(regular.filter(r => `${r.branch}:${r.direction}` === key))])),
  byHopCount: Object.fromEntries([[1, 1], [2, 5], [6, 10], [11, Infinity]].map(([min, max]) => [`${min}-${max}`, summary(regular.filter(r => r.hops >= min && r.hops <= max))])),
  largestErrors: [...regular].sort((a, b) => Math.abs(b.errorSeconds) - Math.abs(a.errorSeconds)).slice(0, 12),
  limits: ["Scheduled ride times, not observed train performance; input times have one-minute resolution.",
    "No initial platform wait, transfer walk, connection wait or missed-connection error is included.",
    "Overlapping spans are correlated; there is no statistical confidence interval or independent sample claim.",
    "No model fitting or holdout claim: the production formula is unchanged.",
    "Tehran results do not establish accuracy or service availability in Mashhad."] };
mkdirSync(".quality-report", { recursive: true });
writeFileSync(".quality-report/route-estimates.json", JSON.stringify(report, null, 2) + "\n");
const keys = Object.keys(rows[0]) as (keyof Row)[];
writeFileSync(".quality-report/route-estimates.csv", [keys.join(","), ...rows.map(r => keys.map(key => JSON.stringify(r[key])).join(","))].join("\n") + "\n");
console.log(JSON.stringify(report, null, 2));
