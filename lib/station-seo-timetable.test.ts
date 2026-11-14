import { describe, expect, it } from "vitest";
import { getStationTimetableSummary } from "./station-seo-timetable";

describe("server-prerendered SEO timetable summaries", () => {
  it("uses bundled scheduled trains rather than guessed station hours", async () => {
    const summary = await getStationTimetableSummary("azadegan");
    expect(summary?.saturday_wednesday).toMatchObject({
      count: 146,
      first: "5:30",
      last: "22:00",
    });
    expect(summary?.thursday).toMatchObject({
      count: 108,
      first: "5:30",
      last: "22:00",
    });
    expect(summary?.friday).toMatchObject({
      count: 98,
      first: "6:00",
      last: "22:00",
    });
  });

  it("does not fabricate a schedule for unknown stations", async () => {
    expect(await getStationTimetableSummary("not-a-station")).toBeNull();
  });
});
