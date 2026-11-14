import { describe, expect, it } from "vitest";
import { cityFromPath, viewFromPath } from "./cities";

describe("embedded Tehran station guide navigation", () => {
  it("keeps the active tab on Stations for station detail URLs", () => {
    for (const path of [
      "/stations", "/tehran/stations",
      "/tehran/stations/tajrish", "/tehran/stations/directory",
    ]) {
      expect(cityFromPath(path)).toBe("tehran");
      expect(viewFromPath(path)).toBe("stations");
    }
  });

  it("does not alter other Metto tabs", () => {
    expect(viewFromPath("/tehran/route")).toBe("route");
    expect(viewFromPath("/tehran/map")).toBe("map");
    expect(viewFromPath("/tehran/nearby")).toBe("nearby");
    expect(viewFromPath("/cities")).toBe("stations");
    expect(viewFromPath("/route")).toBe("route");
  });
});
