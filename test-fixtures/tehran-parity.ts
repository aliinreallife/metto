// Capture/compare the public behavior of the pre-cutover Tehran network.
// Fixture hashes were recorded before replacing the legacy tables, not from
// the compatibility adapter. See docs/metto-data-integration.md.
import { createHash } from "node:crypto";
import type { computeRouteTopology } from "../lib/route";
import type { planRoute } from "../lib/route-planning";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, v]) => [key, canonical(v)]));
  }
  return value;
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function topologyRow(find: typeof computeRouteTopology, from: string, ids: string[]) {
  const digest = createHash("sha256");
  let reachable = 0;
  for (const to of ids) {
    if (from === to) continue;
    const result = find(from, to);
    if (result) reachable++;
    digest.update(JSON.stringify(canonical([to, result])) + "\n");
  }
  return { from, pairs: ids.length - 1, reachable, sha256: digest.digest("hex") };
}

// Include branches, long transfer walks, non-boardable stops, a through ride
// on Line 6, and a journey starting on the open Line 7 platform at Shahrivar.
export const TIMED_PAIRS = [
  ["tajrish", "tehran-sadeghiyeh"],
  ["tehran-sadeghiyeh", "tajrish"],
  ["tehran-sadeghiyeh", "shahid-sepahbod-qasem-soleimani"],
  ["bimeh", "mehrabad-airport-terminal-4-6"],
  ["shahed-baghershahr", "shahr-e-parand"],
  ["shahid-fakhrizadeh", "allameh-jafari"],
  ["amirkabir", "meydan-e-khorasan"],
  ["shohada-ye-hefdah-e-shahrivar", "meydan-e-khorasan"],
  ["vavan", "tajrish"],
] as const;

export const TIMED_SCENARIOS = [
  { name: "weekday-morning", at: "2026-10-19T05:30:00Z", holiday: false },
  { name: "thursday", at: "2026-10-22T05:30:00Z", holiday: false },
  { name: "friday", at: "2026-10-23T05:30:00Z", holiday: false },
  { name: "holiday", at: "2026-10-19T05:30:00Z", holiday: true },
  { name: "last-service", at: "2026-10-19T19:00:00Z", holiday: false },
  { name: "midnight", at: "2026-10-19T20:25:00Z", holiday: false },
] as const;

export function scheduledCases(plan: typeof planRoute) {
  return TIMED_SCENARIOS.flatMap((scenario) => TIMED_PAIRS.flatMap(([from, to]) =>
    (["depart-at", "arrive-by"] as const).map((mode) => {
      const result = plan(from, to, { mode, at: new Date(scenario.at) }, {
        isHolidayDate: () => scenario.holiday,
      });
      return {
        scenario: scenario.name, from, to, mode,
        status: result?.status ?? "unreachable",
        sha256: fingerprint(result),
      };
    }),
  ));
}
