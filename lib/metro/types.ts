// Normalized Tehran Metro network model.
//
// Separation of concerns:
// - MetroStation: physical-station facts only (names, coords, amenities, status).
// - MetroLine: line metadata (colors etc).
// - MetroRoute: ordered station sequences per line/branch (topology source).
// - MetroSegment: explicit edges with their own construction state.
// - ServiceStatus: reserved overlay for future live disruptions; never stored
//   in the static topology.

export type StationId = string;
export type LineId = number;
export type RouteId = string;
export type SegmentId = string;

/** Permanent state of physical infrastructure. */
export type InfrastructureStatus =
  | "operational"
  | "under_construction"
  | "planned"
  | "temporarily_closed"
  | "permanently_closed";

/** State of a track segment between two adjacent stations. Independent from
 *  the status of its endpoint stations. */
export type SegmentStatus =
  | "operational"
  | "under_construction"
  | "planned"
  | "temporarily_closed";

/** Future live-service overlay (not implemented yet). Kept separate from the
 *  static topology so real-time disruptions never rewrite permanent data. */
export type ServiceStatus =
  | "normal"
  | "temporarily_closed"
  | "service_disruption";

export interface StationAmenities {
  wc: boolean;
  elevator: boolean;
  atm: boolean;
  coffeeShop: boolean;
  fastFood: boolean;
  groceryStore: boolean;
  freeWifi: boolean;
  prayerRoom: boolean;
  parking: boolean;
  police: boolean;
}

export interface MetroStation {
  id: StationId;
  name: {
    fa: string;
    en: string;
  };
  location: {
    lat: number;
    lng: number;
  };
  amenities: StationAmenities;
  /**
   * False means the amenity booleans are unverified/unknown — NOT confirmed
   * absence. Absent (undefined) means verified, as for all legacy records.
   */
  amenitiesVerified?: boolean;
  status: InfrastructureStatus;
}

export interface MetroLine {
  id: LineId;
  name: {
    fa: string;
    en: string;
  };
  color: string;
}

export interface MetroRoute {
  id: RouteId;
  lineId: LineId;
  /** e.g. "parand", "mehrabad". Absent for the main route of a line. */
  branchId?: string;
  /**
   * Ordered stops. Junction stations are shared, never duplicated.
   * A stop's status is independent from the physical station status:
   * a station can be operational while its stop on a future line is still
   * under construction (boarding), and trains can pass a non-boardable
   * station when the track itself is operational.
   */
  stops: RouteStop[];
}

/** Boarding status of one station on one route. */
export type StopStatus =
  | "operational"
  | "under_construction"
  | "planned";

export interface RouteStop {
  stationId: StationId;
  status: StopStatus;
}

export interface MetroSegment {
  id: SegmentId;
  lineId: LineId;
  routeId: RouteId;
  branchId?: string;
  from: StationId;
  to: StationId;
  status: SegmentStatus;
}

/** Neighbor info: never bare names, always with line/branch context. */
export interface NeighborInfo {
  stationId: StationId;
  lineId: LineId;
  routeId: RouteId;
  branchId?: string;
  status: SegmentStatus;
}

/** How one ride segment connects to the previous one. */
export type JourneyChange =
  | { type: "none" }
  | {
      type: "train_change";
      stationId: StationId;
      lineId: LineId;
      fromRouteId: RouteId;
      toRouteId: RouteId;
    }
  | {
      type: "line_transfer";
      stationId: StationId;
      fromLineId: LineId;
      toLineId: LineId;
    };
