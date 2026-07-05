import { LINE_SCHEDULES, type TrainSchedule, type DayType } from "./schedule-data";
export type { DayType } from "./schedule-data";
import { STATION_BY_ID } from "./graph";

export type Departure = {
  time: string;
  direction: string; // terminal station ID
  directionName: string; // terminal station display name
  isExpress: boolean;
  line: number;
  minutesUntil: number; // minutes from now
};

/**
 * Get the current day type based on the Iranian weekend/weekday schedule.
 * Saturday-Wednesday: regular schedule
 * Thursday: reduced schedule
 * Friday: holiday schedule
 */
export function getCurrentDayType(): DayType {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (day === 5) return "friday"; // Friday
  if (day === 4) return "thursday"; // Thursday
  return "saturday_wednesday"; // Sat-Wed
}

/**
 * Convert "HH:MM" time string to minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Get next departures from a station on a specific line.
 * Returns departures sorted by time, filtered to trains that stop at this station.
 */
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

  for (const ls of LINE_SCHEDULES) {
    if (ls.line !== line) continue;

    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;

      // Find this station in the train's stops
      const stopIdx = train.stops.findIndex((s) => s.stationId === stationId);
      if (stopIdx === -1) continue;

      // Skip trains heading TOWARD this station (can't board a train going where you already are)
      const lastStop = train.stops[train.stops.length - 1];
      if (lastStop.stationId === stationId) continue;

      const stopTime = train.stops[stopIdx].time;
      const stopMinutes = timeToMinutes(stopTime);

      // Only future trains
      if (stopMinutes < nowMinutes) continue;

      // Direction = the last stop's station ID
      const directionId = lastStop.stationId;
      const directionStation = STATION_BY_ID.get(directionId);
      const directionName = directionStation
        ? directionStation.fa
        : directionId;

      results.push({
        time: stopTime,
        direction: directionId,
        directionName,
        isExpress: train.isExpress,
        line: train.line,
        minutesUntil: stopMinutes - nowMinutes,
      });
    }
  }

  // Sort by time and limit
  results.sort((a, b) => a.minutesUntil - b.minutesUntil);
  return results.slice(0, maxResults);
}

/**
 * Get all departures from a station across all its lines, grouped by line.
 */
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

/**
 * Get ALL departures from a station for a specific line and direction.
 * Returns every train that stops at this station, sorted by time.
 */
export function getAllDepartures(
  stationId: string,
  line: number,
  dayType?: DayType,
): Departure[] {
  const dt = dayType ?? getCurrentDayType();
  const results: Departure[] = [];

  for (const ls of LINE_SCHEDULES) {
    if (ls.line !== line) continue;

    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;

      const stopIdx = train.stops.findIndex((s) => s.stationId === stationId);
      if (stopIdx === -1) continue;

      // Skip trains heading TOWARD this station (can't board a train going where you already are)
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
        minutesUntil: stopMinutes, // not relative here, absolute minutes
      });
    }
  }

  results.sort((a, b) => a.minutesUntil - b.minutesUntil);
  return results;
}

/**
 * Estimate travel time between two adjacent stations on a line using schedule data.
 * Finds a train that stops at both stations and returns the time difference.
 * Falls back to null if no matching train found.
 */
export function getScheduleTravelTime(
  fromId: string,
  toId: string,
  line: number,
  dayType?: DayType,
): number | null {
  const dt = dayType ?? getCurrentDayType();

  for (const ls of LINE_SCHEDULES) {
    if (ls.line !== line) continue;

    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;

      const fromIdx = train.stops.findIndex((s) => s.stationId === fromId);
      const toIdx = train.stops.findIndex((s) => s.stationId === toId);

      // Both stations must be in this train's route, and in the correct order
      if (fromIdx === -1 || toIdx === -1) continue;
      if (toIdx <= fromIdx) continue;

      const fromMinutes = timeToMinutes(train.stops[fromIdx].time);
      const toMinutes = timeToMinutes(train.stops[toIdx].time);
      return (toMinutes - fromMinutes) * 60; // return seconds
    }
  }

  return null;
}

/**
 * Find the shortest travel time between two stations on a line.
 * Searches all trains and returns the minimum travel time found.
 * Handles express trains that skip intermediate stations.
 * Returns seconds, or null if no matching train found.
 */
export function getBestSegmentTime(
  fromId: string,
  toId: string,
  line: number,
  dayType?: DayType,
): number | null {
  const dt = dayType ?? getCurrentDayType();
  let best: number | null = null;

  for (const ls of LINE_SCHEDULES) {
    if (ls.line !== line) continue;

    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;

      const fromIdx = train.stops.findIndex((s) => s.stationId === fromId);
      const toIdx = train.stops.findIndex((s) => s.stationId === toId);

      if (fromIdx === -1 || toIdx === -1) continue;
      if (toIdx <= fromIdx) continue;

      const fromMin = timeToMinutes(train.stops[fromIdx].time);
      const toMin = timeToMinutes(train.stops[toIdx].time);
      const diff = (toMin - fromMin) * 60; // seconds

      if (diff > 0 && (best === null || diff < best)) {
        best = diff;
      }
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

/**
 * Find the best trip from origin to destination on a line.
 * Filters trains by day type, finds trains departing AFTER afterMinutes,
 * and returns the one with the EARLIEST arrival at destination.
 * This accounts for: day type, departure time, express vs local.
 */
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

  for (const ls of LINE_SCHEDULES) {
    if (ls.line !== line) continue;

    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;

      const fromIdx = train.stops.findIndex((s) => s.stationId === fromId);
      const toIdx = train.stops.findIndex((s) => s.stationId === toId);

      if (fromIdx === -1 || toIdx === -1) continue;
      if (toIdx <= fromIdx) continue;

      // Filter by express if requested
      if (options?.expressOnly && !train.isExpress) continue;
      if (options?.localOnly && train.isExpress) continue;

      const departMin = timeToMinutes(train.stops[fromIdx].time);
      const arriveMin = timeToMinutes(train.stops[toIdx].time);

      // Must depart after the specified time
      if (departMin < afterMinutes) continue;

      // Pick the train with earliest arrival
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

/**
 * Find the arrival time at a station for a specific train on a line.
 * Returns minutes since midnight, or null if not found.
 */
export function getTrainArrivalAtStation(
  stationId: string,
  line: number,
  dayType?: DayType,
): number | null {
  const dt = dayType ?? getCurrentDayType();

  for (const ls of LINE_SCHEDULES) {
    if (ls.line !== line) continue;

    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;

      const stop = train.stops.find((s) => s.stationId === stationId);
      if (stop) {
        return timeToMinutes(stop.time);

      }
    }
  }

  return null;
}

/**
 * Get the arrival time at a destination for the next train from an origin on a line.
 * Uses the actual timetable: finds a train that stops at both stations (origin before dest)
 * and returns the arrival time at the destination in minutes since midnight.
 * Returns null if no such train found.
 */
export function getArrivalFromOrigin(
  originId: string,
  destId: string,
  line: number,
  afterMinutes: number,
  dayType?: DayType,
): number | null {
  const dt = dayType ?? getCurrentDayType();

  for (const ls of LINE_SCHEDULES) {
    if (ls.line !== line) continue;

    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;

      const originIdx = train.stops.findIndex((s) => s.stationId === originId);
      const destIdx = train.stops.findIndex((s) => s.stationId === destId);

      // Both stations must exist and origin must come before dest
      if (originIdx === -1 || destIdx === -1) continue;
      if (destIdx <= originIdx) continue;

      const departMinutes = timeToMinutes(train.stops[originIdx].time);
      const arriveMinutes = timeToMinutes(train.stops[destIdx].time);

      // Only trains departing after the specified time
      if (departMinutes < afterMinutes) continue;

      return arriveMinutes;
    }
  }

  return null;
}

/**
 * Check if a connection can be made at a transfer station.
 * Given arrival time (minutes since midnight) at a transfer station,
 * check if there's a departing train on the next line after that time.
 * Returns the next available departure time (minutes) or null if missed.
 */
export function checkConnection(
  transferStationId: string,
  nextLine: number,
  arrivalMinutes: number,
  dayType?: DayType,
): { available: boolean; nextDeparture: number | null } {
  const dt = dayType ?? getCurrentDayType();
  let earliest = Infinity;

  for (const ls of LINE_SCHEDULES) {
    if (ls.line !== nextLine) continue;

    for (const train of ls.trains) {
      if (train.dayType !== dt) continue;

      const stop = train.stops.find((s) => s.stationId === transferStationId);
      if (!stop) continue;

      const depMinutes = timeToMinutes(stop.time);
      if (depMinutes > arrivalMinutes && depMinutes < earliest) {
        earliest = depMinutes;
      }
    }
  }

  return {
    available: earliest < Infinity,
    nextDeparture: earliest < Infinity ? earliest : null,
  };
}
