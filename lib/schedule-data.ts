// Types only — data is lazy-loaded from /schedule-data.json
export type DayType = "saturday_wednesday" | "thursday" | "friday";

export type TrainStop = {
  stationId: string;
  time: string;
};

export type TrainSchedule = {
  line: number;
  direction: string;
  dayType: DayType;
  isExpress: boolean;
  stops: TrainStop[];
};

export type LineScheduleData = {
  line: number;
  terminalA: string;
  terminalB: string;
  isBranch: boolean;
  scheduleKey: string;
  trains: TrainSchedule[];
};
