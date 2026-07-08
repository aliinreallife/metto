import type { TrainSchedule, DayType, LineScheduleData } from "./schedule-data";
export type { DayType } from "./schedule-data";
import { STATION_BY_ID } from "./graph";

// Lazy-loaded schedule data cache
let _scheduleData: LineScheduleData[] | null = null;
let _schedulePromise: Promise<LineScheduleData[]> | null = null;

async function getScheduleData(): Promise<LineScheduleData[]> {
  if (_scheduleData) return _scheduleData;
  if (_schedulePromise) return _schedulePromise;

  _schedulePromise = fetch("/schedule-data.json")
    .then((r) => r.json())
    .then((data) => {
      _scheduleData = data;
      return data;
    });

  return _schedulePromise;
}

// Synchronous accessor — returns empty array if data not loaded yet
function getSchedules(): LineScheduleData[] {
  return _scheduleData ?? [];
}

export { getScheduleData as loadScheduleData };

export type Departure = {
  time: string;
  direction: string;
  directionName: string;
  isExpress: boolean;
  line: number;
  minutesUntil: number;
};

export function getCurrentDayType(): DayType {
  const day = new Date().getDay();
  if (day === 5) return "friday";
  if (day === 4) return "thursday";
  return "saturday_wednesday";
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function getNextDepartures(
  stationId: string,
  line: number,
  dayType?: DayType,
  maxResults: number = 5,
): Departure[] {
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
      const directionStation = STATION_BY_ID.get(directionId);

      results.push({
        time: stopTime,
        direction: directionId,
        directionName: directionStation ? directionStation.fa : directionId,
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
  stationId: string,
  dayType?: DayType,
  maxPerLine: number = 3,
): { line: number; departures: Departure[] }[] {
  const station = STATION_BY_ID.get(stationId);
  if (!station) return [];
  return station.lines.map((line) => ({
    line,
    departures: getNextDepartures(stationId, line, dayType, maxPerLine),
  }));
}

export function getAllDepartures(
  stationId: string,
  line: number,
  dayType?: DayType,
): Departure[] {
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
      const directionStation = STATION_BY_ID.get(directionId);

      results.push({
        time: stopTime,
        direction: directionId,
        directionName: directionStation ? directionStation.fa : directionId,
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
  fromId: string,
  toId: string,
  line: number,
  dayType?: DayType,
): number | null {
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
  fromId: string,
  toId: string,
  line: number,
  dayType?: DayType,
): number | null {
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
  fromId: string,
  toId: string,
  line: number,
  afterMinutes: number,
  dayType?: DayType,
  options?: { expressOnly?: boolean; localOnly?: boolean },
): TripResult | null {
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

export function getTrainArrivalAtStation(
  stationId: string,
  line: number,
  dayType?: DayType,
): number | null {
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
  originId: string,
  destId: string,
  line: number,
  afterMinutes: number,
  dayType?: DayType,
): number | null {
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
  transferStationId: string,
  nextLine: number,
  arrivalMinutes: number,
  dayType?: DayType,
): { available: boolean; nextDeparture: number | null } {
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
