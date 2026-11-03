import data from "@/data/reference/tabriz-line1.json";
import { tehranParts, parseServiceTimeToMinutes, tehranMinuteToInstant } from "./tehran-time";
import { getHolidayState } from "./holidays/local-resolver";
import type { HolidayDataset } from "./holidays/local-dataset";

export { data as tabrizServiceData };
export type TabrizServiceId = "normal" | "holiday";

export function tabrizServiceDay(instantMs: number, holidays: HolidayDataset | null) {
  const { dateStr, minuteOfDay, dayType } = tehranParts(instantMs);
  const holiday = getHolidayState(holidays, dateStr);
  const covered = holidays !== null && dateStr >= holidays.validFrom && dateStr <= holidays.validThrough;
  // TimeMetro publishes normal/holiday tables, but not an authoritative
  // exception calendar. Treat Friday and listed public holidays as holiday
  // pattern. Thursday is provisionally normal; other secondary sources
  // disagree, so never imply that this choice has been operator-confirmed.
  const serviceId: TabrizServiceId = dayType === "friday" || holiday === "holiday" ? "holiday" : "normal";
  return { dateStr, minuteOfDay, serviceId, applicable: true as const, blocked: false as const,
    holidayAssumption: holiday === "holiday" || dayType === "thursday",
    calendarUnknown: !covered && holiday === "unknown" && dayType !== "friday",
  };
}

export function findTabrizTrips(from: string, to: string, instantMs: number,
  holidays: HolidayDataset | null, options: { arriveBy?: boolean; notBeforeMs?: number } = {}) {
  const service = tabrizServiceDay(instantMs, holidays);
  const a = data.stationIds.indexOf(from), b = data.stationIds.indexOf(to);
  if (a < 0 || b < 0 || a === b) return { ...service, trips: [] as TabrizTrip[] };
  const direction = a < b ? "to_noor" : "to_el_goli";
  const trips = data.trips.filter(t => t.serviceId === service.serviceId && t.direction === direction)
    .flatMap(t => {
      const departure = t.times[a], arrival = t.times[b];
      if (!departure || !arrival) return [];
      const departMinute = parseServiceTimeToMinutes(departure);
      const arriveMinute = parseServiceTimeToMinutes(arrival);
      if (arriveMinute <= departMinute) return [];
      const departureMs = tehranMinuteToInstant(service.dateStr, departMinute);
      const arrivalMs = tehranMinuteToInstant(service.dateStr, arriveMinute);
      if (options.arriveBy
        ? arrivalMs > instantMs || departureMs < (options.notBeforeMs ?? -Infinity)
        : departureMs < instantMs) return [];
      return [{ id: t.id, departure, arrival, departureMs,
        minutes: arriveMinute - departMinute,
        terminalId: a < b ? data.stationIds.at(-1)! : data.stationIds[0] }];
    }).sort((x, y) => options.arriveBy ? y.departureMs - x.departureMs : x.departureMs - y.departureMs);
  return { ...service, trips };
}

export type TabrizTrip = {
  id: string; departure: string; arrival: string; departureMs: number;
  minutes: number; terminalId: string;
};
