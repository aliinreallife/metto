// Shared timetable adapter for the cities that publish separate line data.
// Do not derive departure times from headways or borrow Tehran's schedule.
import { isfahanServiceData, isfahanServiceDay } from "./isfahan-timetable";
import { tabrizServiceData, tabrizServiceDay } from "./tabriz-timetable";
import type { HolidayDataset } from "./holidays/local-dataset";
import type { CityId } from "./cities";

export type RegionalTimedCity = Extract<CityId, "isfahan" | "tabriz">;
export type RegionalDeparture = {
  time: string;
  directionId: string;
  lineId: string;
};
export type ServicePattern = { id: string; label: { fa: string; en: string } };

export function regionalServicePatterns(city: RegionalTimedCity): ServicePattern[] {
  return city === "isfahan" ? [
    { id: "saturday_thursday", label: { fa: "شنبه تا پنجشنبه", en: "Sat–Thu" } },
    { id: "friday", label: { fa: "جمعه / تعطیلات (موقت)", en: "Friday / holidays (provisional)" } },
  ] : [
    { id: "normal", label: { fa: "روزهای عادی", en: "Normal days" } },
    { id: "holiday", label: { fa: "جمعه / تعطیلات (آزمایشی)", en: "Friday / holidays (provisional)" } },
  ];
}
export function initialRegionalPattern(city: RegionalTimedCity): string {
  return city === "isfahan" ? "saturday_thursday" : "normal";
}
export function regionalServiceDay(
  city: RegionalTimedCity, nowMs: number, holidays: HolidayDataset | null,
): { serviceId: string | null; applicable: boolean; holidayAssumption: boolean; calendarUnknown: boolean } {
  return city === "isfahan" ? isfahanServiceDay(nowMs, holidays) : tabrizServiceDay(nowMs, holidays);
}

/** Station-specific published departure rows. Exclude arrivals at terminals.
 * Isfahan Friday no-boarding stations stay excluded even when sources have
 * a conflicting non-null cell. Do not claim these times are live estimates. */
export function regionalStationDepartures(
  city: RegionalTimedCity, stationId: string, pattern: string,
): RegionalDeparture[] {
  const data = city === "isfahan" ? isfahanServiceData : tabrizServiceData;
  const stationIndex = data.stationIds.indexOf(stationId);
  if (stationIndex < 0 || !regionalServicePatterns(city).some(p => p.id === pattern)) return [];
  if (city === "isfahan" && pattern === "friday" &&
    isfahanServiceData.release.fridayNoBoardingStationIds.includes(stationId)) return [];

  const last = data.stationIds.length - 1;
  const result: RegionalDeparture[] = [];
  for (const trip of data.trips) {
    if (trip.serviceId !== pattern) continue;
    const toEnd = city === "isfahan"
      ? trip.direction === "qods_to_defa"
      : trip.direction === "to_noor";
    if ((toEnd && stationIndex === last) || (!toEnd && stationIndex === 0)) continue;
    const time = trip.times[stationIndex];
    if (!time || !/^\d{1,2}:\d{2}$/.test(time)) continue;
    result.push({
      time, directionId: toEnd ? data.stationIds[last] : data.stationIds[0],
      lineId: `${city}:line:1`,
    });
  }
  return result.sort((a,b) => a.time.localeCompare(b.time));
}
