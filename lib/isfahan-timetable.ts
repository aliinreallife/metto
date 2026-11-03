import data from "@/data/reference/isfahan-service.json";
import { tehranParts, parseServiceTimeToMinutes, tehranMinuteToInstant } from "./tehran-time";
import { getHolidayState } from "./holidays/local-resolver";
import { resolveIsfahanServiceDate } from "./isfahan-calendar";
import type { HolidayDataset } from "./holidays/local-dataset";
export { data as isfahanServiceData };
export function isfahanServiceDay(instantMs: number, holidays: HolidayDataset | null) {
  const { dateStr, minuteOfDay, dayType } = tehranParts(instantMs);
  const holiday = getHolidayState(holidays, dateStr);
  // The bundled calendar lists known holidays; unlisted dates remain UNKNOWN.
  // Within its coverage use the weekday pattern provisionally, with an explicit UI note.
  const covered = holidays !== null && dateStr >= holidays.validFrom && dateStr <= holidays.validThrough;
  const resolution = resolveIsfahanServiceDate(dateStr, holiday === "holiday" ? "public_holiday" : holiday === "non-holiday" || covered ? "ordinary" : "unknown");
  return { dateStr, minuteOfDay, serviceId: resolution.serviceId,
    holidayAssumption: resolution.availability === "assumed_pattern",
    // The holiday catalog lists exceptional days, not every ordinary date.
    // Within its documented coverage, an unlisted weekday uses the ordinary
    // pattern without falsely branding every normal journey as uncertain.
    calendarUnknown: !covered && holiday === "unknown" && dayType !== "friday",
    applicable: resolution.serviceId !== null,
  };
}
function findIsfahanTripsForDay(from: string, to: string, instantMs: number, holidays: HolidayDataset | null, options: { arriveBy?: boolean; notBeforeMs?: number } = {}) {
  const service = isfahanServiceDay(instantMs, holidays);
  const fromIndex = data.stationIds.indexOf(from), toIndex = data.stationIds.indexOf(to);
  const direction = fromIndex < toIndex ? "qods_to_defa" : "defa_to_qods";
  const blocked = service.serviceId === "friday" && [from, to].some(id => data.release.fridayNoBoardingStationIds.includes(id));
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex || blocked || !service.applicable) return { ...service, blocked, trips: [] };
  const trips = data.trips.filter(t => t.serviceId === service.serviceId && t.direction === direction).flatMap(t => {
    const depart = t.times[fromIndex], arrive = t.times[toIndex];
    if (!depart || !arrive) return [];
    const departMs = tehranMinuteToInstant(service.dateStr, parseServiceTimeToMinutes(depart));
    const arrivalMs = tehranMinuteToInstant(service.dateStr, parseServiceTimeToMinutes(arrive));
    const feasible = options.arriveBy ? arrivalMs <= instantMs && departMs >= (options.notBeforeMs ?? -Infinity) : departMs >= instantMs;
    return !feasible ? [] : [{ id: t.id, departure: depart, arrival: arrive, departureMs: departMs,
      minutes: parseServiceTimeToMinutes(arrive) - parseServiceTimeToMinutes(depart),
      terminalId: direction === "qods_to_defa" ? data.stationIds.at(-1)! : data.stationIds[0] }];
  }).sort((a, b) => options.arriveBy ? b.departureMs - a.departureMs : a.departureMs - b.departureMs);
  return { ...service, blocked, trips };
}

/** Arrive-by may use the previous evening's last train for an early deadline. */
export function findIsfahanTrips(from: string, to: string, instantMs: number, holidays: HolidayDataset | null,
  options: { arriveBy?: boolean; notBeforeMs?: number } = {}) {
  const current = findIsfahanTripsForDay(from, to, instantMs, holidays, options);
  if (!options.arriveBy) return current;
  const previous = findIsfahanTripsForDay(from, to, tehranMinuteToInstant(current.dateStr, 0) - 1, holidays, options);
  // Match Tehran's arrive-by semantics: the trip must *arrive on the
  // requested date*. A Friday 22:39 arrival is not a valid Saturday 01:00
  // journey. Only actual post-midnight services from yesterday may qualify.
  const previousOvernight = previous.trips.filter(trip =>
    tehranParts(tehranMinuteToInstant(previous.dateStr, parseServiceTimeToMinutes(trip.arrival))).dateStr === current.dateStr,
  );
  return current.trips.length ? current : previousOvernight.length ? { ...previous, trips: previousOvernight } : current;
}
