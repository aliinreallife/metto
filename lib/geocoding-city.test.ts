import {afterEach,expect,it,vi} from "vitest";
afterEach(()=>vi.unstubAllGlobals());
it("isolates identical landmark queries by city and rejects foreign Mashhad results",async()=>{
  vi.resetModules();
  const fetcher=vi.fn().mockImplementation(async()=>Response.json([
    {display_name:"Mashhad place",lat:"36.29",lon:"59.60",type:"museum"},
    {display_name:"Tehran place",lat:"35.70",lon:"51.40",type:"museum"},
  ]));
  vi.stubGlobal("fetch",fetcher);
  const {searchPlaces}=await import("./geocoding");
  await searchPlaces("Museum","en");
  const mashhad=await searchPlaces("Museum","en",5,"mashhad");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("viewbox")).toBe("51.15,35.55,51.65,35.85");
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("viewbox")).toBe("59.35,36.10,59.85,36.50");
  expect(mashhad.map(p=>p.displayName)).toEqual(["Mashhad place"]);
  await searchPlaces("Museum","en",5,"mashhad");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
