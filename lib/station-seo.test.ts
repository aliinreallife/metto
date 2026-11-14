import { describe, expect, it } from "vitest";
import { STATIONS } from "./metro/stations";
import { getOperationalStationLines } from "./metro/selectors";
import {
  SEO_STATIONS, STATION_DIRECTORY_PATH, absoluteSeoUrl,
  breadcrumbsJsonLd, getSeoStation, safeJsonLd,
  stationJsonLd, stationSeoPath,
} from "./station-seo";

describe("indexable Tehran station guides", () => {
  it("uses only canonical, operational and boardable stations", () => {
    expect(SEO_STATIONS.length).toBeGreaterThan(100);
    expect(new Set(SEO_STATIONS.map(station => station.id)).size).toBe(SEO_STATIONS.length);
    for (const station of SEO_STATIONS) {
      expect(station.status).toBe("operational");
      expect(getOperationalStationLines(station.id).length).toBeGreaterThan(0);
      expect(getSeoStation(station.id)).toBe(station);
      expect(stationSeoPath(station.id)).toMatch(/^\/tehran\/stations\/[a-z0-9-]+$/);
    }
    for (const station of STATIONS.filter(station => station.status !== "operational")) {
      expect(getSeoStation(station.id)).toBeUndefined();
    }
    expect(getSeoStation("directory")).toBeUndefined();
    expect(getSeoStation("not-a-station")).toBeUndefined();
  });

  it("produces truthful, discoverable schema and navigation", () => {
    const station = getSeoStation("tajrish");
    expect(station).toBeDefined();
    const schema = stationJsonLd(station!);
    expect(schema).toMatchObject({
      "@type": "SubwayStation",
      name: "تجریش",
      url: "https://metto.ir/tehran/stations/tajrish",
      geo: {
        "@type": "GeoCoordinates",
        latitude: station!.location.lat,
        longitude: station!.location.lng,
      },
    });
    const crumbs = breadcrumbsJsonLd([
      { name: "متو", href: "/" },
      { name: "راهنما", href: STATION_DIRECTORY_PATH },
    ]);
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "متو", item: "https://metto.ir" },
      { "@type": "ListItem", position: 2, name: "راهنما", item: absoluteSeoUrl(STATION_DIRECTORY_PATH) },
    ]);
  });

  it("escapes markup injected into JSON-LD text", () => {
    const json = safeJsonLd({ name: "</script><script>evil()</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json).name).toContain("</script>");
  });
});
