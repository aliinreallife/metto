import type { TrainSchedule, DayType, LineScheduleData } from "./schedule-data";
export type { DayType } from "./schedule-data";
import {
  getStation,
  getStationLines,
  resolveStationId,
} from "./metro/selectors";
import { parseServiceTimeToMinutes, tehranParts } from "./tehran-time";
import {
  getMetroScheduleDayType,
  scheduleDayToDayType,
} from "./holidays/schedule-day";
import type { IsHolidayDate } from "./holidays/types";

// Lazy-loaded schedule data cache with listener system
let _scheduleData: LineScheduleData[] | null = null;
let _schedulePromise: Promise<LineScheduleData[]> | null = null;
let _listeners: Array<() => void> = [];

function notifyListeners() {
  for (const fn of _listeners) fn();
  _listeners = [];
}

async function getScheduleData(): Promise<LineScheduleData[]> {
  if (_scheduleData) return _scheduleData;
  if (_schedulePromise) return _schedulePromise;

  _schedulePromise = fetch("/schedule-data.json")
    .then((r) => r.json())
    .then((data) => {
      _scheduleData = remapScheduleIds(data);
      notifyListeners();
      return _scheduleData;
    })
    .catch((err) => {
      _schedulePromise = null;
      throw err;
    });

  return _schedulePromise;
}

// schedule-data.json may still use legacy English-name IDs; normalize every
// id to the stable slug once at load so the rest of the code only sees slugs.
// Exported for the server-side loader (lib/schedule-server.ts).
export function remapScheduleIds(data: LineScheduleData[]): LineScheduleData[] {
  const mapId = (id: string) => resolveStationId(id) ?? id;
  for (const ls of data) {
    ls.terminalA = mapId(ls.terminalA);
    ls.terminalB = mapId(ls.terminalB);
    for (const train of ls.trains) {
      train.direction = mapId(train.direction);
      for (const stop of train.stops) stop.stationId = mapId(stop.stationId);
    }
  }
  return data;
}

// Normalize legacy English-name IDs at the entry of every public helper so
// callers can pass either form regardless of schedule-data.json vintage.
function normId(id: string): string {
  return resolveStationId(id) ?? id;
}

export function isScheduleDataLoaded(): boolean {
  return _scheduleData !== null;
}

/** Test-only seam: inject schedule rows without fetching. Not for production. */
export function __setScheduleDataForTests(
  data: LineScheduleData[] | null,
): void {
  if (data === null) {
    _scheduleData = null;
    _schedulePromise = null;
    return;
  }
  setServerScheduleData(data);
}

/**
 * Explicit production setter for server-side schedule loading
 * (see lib/schedule-server.ts). Normalizes IDs exactly like the
 * client fetch path. Notifies listeners, same as a completed fetch.
 */
export function setServerScheduleData(data: LineScheduleData[]): void {
  _scheduleData = remapScheduleIds(data);
  _schedulePromise = null;
  notifyListeners();
}

export function onScheduleDataReady(callback: () => void): () => void {
  if (_scheduleData) {
    callback();
    return () => {};
  }
  _listeners.push(callback);
  return () => {
    _listeners = _listeners.filter((fn) => fn !== callback);
  };
}

export { getScheduleData as loadScheduleData };

function getSchedules(): LineScheduleData[] {
  return _scheduleData ?? [];
}

export type Departure = {
  time: string;
  direction: string;
  directionName: string;
  isExpress: boolean;
  line: number;
  minutesUntil: number;
};

export function getCurrentDayType(at?: Date, isHolidayDate?: IsHolidayDate): DayType {
  if (isHolidayDate) {
    return scheduleDayToDayType(
      getMetroScheduleDayType(at ?? new Date(), isHolidayDate),
    );
  }
  return tehranParts((at ?? new Date()).getTime()).dayType;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function getNextDepartures(
  stationIdInput: string,
  line: number,
  dayType?: DayType,
  maxResults: number = 5,
): Departure[] {
  const stationId = normId(stationIdInput);
  const dt = dayType ?? getCurrentDayType();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const results: Departure[] = [];

  for (const ls of getSchedules()) {
    if (ls.line !== line) continue;
    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;
      const stopIdx = train.stops.findIndex((s) => s.stationId === stationId);
      if (stopIdx === -1) continue;
      const lastStop = train.stops[train.stops.length - 1];
      if (lastStop.stationId === stationId) continue;

      const stopTime = train.stops[stopIdx].time;
      const stopMinutes = timeToMinutes(stopTime);
      if (stopMinutes < nowMinutes) continue;

      const directionId = lastStop.stationId;
      const directionStation = getStation(directionId);

      results.push({
        time: stopTime,
        direction: directionId,
        directionName: directionStation ? directionStation.name.fa : directionId,
        isExpress: train.isExpress,
        line: train.line,
        minutesUntil: stopMinutes - nowMinutes,
      });
    }
  }

  results.sort((a, b) => a.minutesUntil - b.minutesUntil);
  return results.slice(0, maxResults);
}

export function getStationDepartures(
  stationIdInput: string,
  dayType?: DayType,
  maxPerLine: number = 3,
): { line: number; departures: Departure[] }[] {
  const stationId = normId(stationIdInput);
  const station = getStation(stationId);
  if (!station) return [];
  return getStationLines(stationId).map((line) => ({
    line,
    departures: getNextDepartures(stationId, line, dayType, maxPerLine),
  }));
}

export function getAllDepartures(
  stationIdInput: string,
  line: number,
  dayType?: DayType,
): Departure[] {
  const stationId = normId(stationIdInput);
  const dt = dayType ?? getCurrentDayType();
  const results: Departure[] = [];

  for (const ls of getSchedules()) {
    if (ls.line !== line) continue;
    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;
      const stopIdx = train.stops.findIndex((s) => s.stationId === stationId);
      if (stopIdx === -1) continue;
      const lastStop = train.stops[train.stops.length - 1];
      if (lastStop.stationId === stationId) continue;

      const stopTime = train.stops[stopIdx].time;
      const stopMinutes = timeToMinutes(stopTime);
      const directionId = lastStop.stationId;
      const directionStation = getStation(directionId);

      results.push({
        time: stopTime,
        direction: directionId,
        directionName: directionStation ? directionStation.name.fa : directionId,
        isExpress: train.isExpress,
        line: train.line,
        minutesUntil: stopMinutes,
      });
    }
  }

  results.sort((a, b) => a.minutesUntil - b.minutesUntil);
  return results;
}

export function getScheduleTravelTime(
  fromIdInput: string,
  toIdInput: string,
  line: number,
  dayType?: DayType,
): number | null {
  const fromId = normId(fromIdInput);
  const toId = normId(toIdInput);
  const dt = dayType ?? getCurrentDayType();

  for (const ls of getSchedules()) {
    if (ls.line !== line) continue;
    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;
      const fromIdx = train.stops.findIndex((s) => s.stationId === fromId);
      const toIdx = train.stops.findIndex((s) => s.stationId === toId);
      if (fromIdx === -1 || toIdx === -1) continue;
      if (toIdx <= fromIdx) continue;
      return (timeToMinutes(train.stops[toIdx].time) - timeToMinutes(train.stops[fromIdx].time)) * 60;
    }
  }
  return null;
}

export function getBestSegmentTime(
  fromIdInput: string,
  toIdInput: string,
  line: number,
  dayType?: DayType,
): number | null {
  const fromId = normId(fromIdInput);
  const toId = normId(toIdInput);
  const dt = dayType ?? getCurrentDayType();
  let best: number | null = null;

  for (const ls of getSchedules()) {
    if (ls.line !== line) continue;
    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;
      const fromIdx = train.stops.findIndex((s) => s.stationId === fromId);
      const toIdx = train.stops.findIndex((s) => s.stationId === toId);
      if (fromIdx === -1 || toIdx === -1) continue;
      if (toIdx <= fromIdx) continue;
      const diff = (timeToMinutes(train.stops[toIdx].time) - timeToMinutes(train.stops[fromIdx].time)) * 60;
      if (diff > 0 && (best === null || diff < best)) best = diff;
    }
  }
  return best;
}

export type TripResult = {
  train: TrainSchedule;
  departTime: string;
  arriveTime: string;
  travelMinutes: number;
};

export function findBestTrip(
  fromIdInput: string,
  toIdInput: string,
  line: number,
  afterMinutes: number,
  dayType?: DayType,
  options?: { expressOnly?: boolean; localOnly?: boolean },
): TripResult | null {
  const fromId = normId(fromIdInput);
  const toId = normId(toIdInput);
  const dt = dayType ?? getCurrentDayType();
  let bestArrival = Infinity;
  let bestResult: TripResult | null = null;

  for (const ls of getSchedules()) {
    if (ls.line !== line) continue;
    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;
      const fromIdx = train.stops.findIndex((s) => s.stationId === fromId);
      const toIdx = train.stops.findIndex((s) => s.stationId === toId);
      if (fromIdx === -1 || toIdx === -1) continue;
      if (toIdx <= fromIdx) continue;
      if (options?.expressOnly && !train.isExpress) continue;
      if (options?.localOnly && train.isExpress) continue;

      const departMin = timeToMinutes(train.stops[fromIdx].time);
      const arriveMin = timeToMinutes(train.stops[toIdx].time);
      if (departMin < afterMinutes) continue;

      if (arriveMin < bestArrival) {
        bestArrival = arriveMin;
        bestResult = {
          train,
          departTime: train.stops[fromIdx].time,
          arriveTime: train.stops[toIdx].time,
          travelMinutes: arriveMin - departMin,
        };
      }
    }
  }
  return bestResult;
}

export type TripLookupResult =
  | { status: "found"; trip: TripResult }
  | { status: "missing_schedule_data" }
  | { status: "no_service" };

/**
 * Typed timetable lookup for one ride leg (specific line/from/to/dayType).
 * - "found": a train departs at/after afterMinutes (service-minute clock,
 *   24h+ aware so post-midnight times like 24:06 work).
 * - "missing_schedule_data": no schedule rows exist for this line/dayType
 *   (data not loaded, or the line has no published service) — geometric
 *   fallback is allowed.
 * - "no_service": the timetable covers this line/dayType but offers no
 *   departure for this lookup — never synthesize a fallback train.
 * Deliberately separate from findBestTrip (kept for existing callers); no
 * timetable-architecture changes here.
 */
export function findTripDetailed(
  fromIdInput: string,
  toIdInput: string,
  line: number,
  afterMinutes: number,
  dayType?: DayType,
  options?: { expressOnly?: boolean; localOnly?: boolean },
): TripLookupResult {
  const fromId = normId(fromIdInput);
  const toId = normId(toIdInput);
  const dt = dayType ?? getCurrentDayType();
  if (_scheduleData === null) return { status: "missing_schedule_data" };
  const lineRows = getSchedules().filter((ls) => ls.line === line);
  if (lineRows.length === 0) return { status: "missing_schedule_data" };
  const dayTrains = lineRows
    .flatMap((ls) => ls.trains)
    .filter((t) => t.dayType === dt);
  if (dayTrains.length === 0) return { status: "missing_schedule_data" };

  let bestArrival = Infinity;
  let bestResult: TripResult | null = null;
  for (const train of dayTrains) {
    const fromIdx = train.stops.findIndex((s) => s.stationId === fromId);
    const toIdx = train.stops.findIndex((s) => s.stationId === toId);
    if (fromIdx === -1 || toIdx === -1) continue;
    if (toIdx <= fromIdx) continue;
    if (options?.expressOnly && !train.isExpress) continue;
    if (options?.localOnly && train.isExpress) continue;

    const departMin = parseServiceTimeToMinutes(train.stops[fromIdx].time);
    let arriveMin = parseServiceTimeToMinutes(train.stops[toIdx].time);
    // A trip itself may cross midnight (arrive clock earlier than depart).
    if (arriveMin < departMin) arriveMin += 24 * 60;
    if (departMin < afterMinutes) continue;

    if (arriveMin < bestArrival) {
      bestArrival = arriveMin;
      bestResult = {
        train,
        departTime: train.stops[fromIdx].time,
        arriveTime: train.stops[toIdx].time,
        travelMinutes: arriveMin - departMin,
      };
    }
  }
  if (!bestResult) return { status: "no_service" };
  return { status: "found", trip: bestResult };
}

export function getTrainArrivalAtStation(
  stationIdInput: string,
  line: number,
  dayType?: DayType,
): number | null {
  const stationId = normId(stationIdInput);
  const dt = dayType ?? getCurrentDayType();

  for (const ls of getSchedules()) {
    if (ls.line !== line) continue;
    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;
      const stop = train.stops.find((s) => s.stationId === stationId);
      if (stop) return timeToMinutes(stop.time);
    }
  }
  return null;
}

export function getArrivalFromOrigin(
  originIdInput: string,
  destIdInput: string,
  line: number,
  afterMinutes: number,
  dayType?: DayType,
): number | null {
  const originId = normId(originIdInput);
  const destId = normId(destIdInput);
  const dt = dayType ?? getCurrentDayType();

  for (const ls of getSchedules()) {
    if (ls.line !== line) continue;
    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;
      const originIdx = train.stops.findIndex((s) => s.stationId === originId);
      const destIdx = train.stops.findIndex((s) => s.stationId === destId);
      if (originIdx === -1 || destIdx === -1) continue;
      if (destIdx <= originIdx) continue;
      const departMinutes = timeToMinutes(train.stops[originIdx].time);
      if (departMinutes < afterMinutes) continue;
      return timeToMinutes(train.stops[destIdx].time);
    }
  }
  return null;
}

export function checkConnection(
  transferStationIdInput: string,
  nextLine: number,
  arrivalMinutes: number,
  dayType?: DayType,
): { available: boolean; nextDeparture: number | null } {
  const transferStationId = normId(transferStationIdInput);
  const dt = dayType ?? getCurrentDayType();
  let earliest = Infinity;

  for (const ls of getSchedules()) {
    if (ls.line !== nextLine) continue;
    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;
      const stop = train.stops.find((s) => s.stationId === transferStationId);
      if (!stop) continue;
      const depMinutes = timeToMinutes(stop.time);
      if (depMinutes > arrivalMinutes && depMinutes < earliest) earliest = depMinutes;
    }
  }

  return {
    available: earliest < Infinity,
    nextDeparture: earliest < Infinity ? earliest : null,
  };
}
