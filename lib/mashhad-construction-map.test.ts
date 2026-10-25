import {expect,it} from "vitest";
import reference from "@/data/reference/mashhad-construction.json";
import {mashhadPreview} from "./mashhad-preview";
import {CITY_EDGES,cityCounts} from "./city-catalog";
it("keeps construction geometry outside the passenger station and route catalog",()=>{
 expect(reference.purpose).toBe("map-reference-only");
 expect(reference.license).toBe("ODbL-1.0");
 expect(reference.segments).toHaveLength(5);
 expect(new Set(reference.segments.map(s=>s.lineId))).toEqual(new Set(["mashhad:line:3","mashhad:line:4"]));
 expect(reference.segments.every(s=>s.status==="under_construction"&&s.coordinates.length>=2)).toBe(true);
 expect(reference.segments.some(s=>s.id==="osm:way:1388754301")).toBe(false);
 expect(cityCounts(["mashhad"])).toEqual({stations:36,lines:2,cities:1});
 expect(CITY_EDGES.filter(e=>e.lineId.startsWith("mashhad:")).every(e=>["mashhad:line:1","mashhad:line:2"].includes(e.lineId))).toBe(true);
 expect(mashhadPreview.findPath("mashhad:station:airport","mashhad:station:bab-al-javad")).toBeNull();
});
