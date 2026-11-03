import {afterEach,expect,it,vi} from "vitest";
afterEach(()=>vi.unstubAllGlobals());
it("uses Isfahan's bounds and refuses unknown cities without a Tehran fallback", async()=>{
  vi.resetModules();
  const fetcher=vi.fn().mockImplementation(async()=>Response.json([
    {display_name:"Isfahan place",lat:"32.65",lon:"51.67",type:"museum"},
    {display_name:"Tehran place",lat:"35.70",lon:"51.40",type:"museum"},
  ]));
  vi.stubGlobal("fetch",fetcher);
  const {searchPlaces}=await import("./geocoding");
  expect((await searchPlaces("Museum","en",5,"isfahan")).map(p=>p.displayName)).toEqual(["Isfahan place"]);
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("viewbox")).toBe("51.5,32.5,51.85,32.85");
  expect(await searchPlaces("Museum","en",5,"unknown" as never)).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("looks up Isfahan's local landmark under its verified Persian search name", async()=>{
  vi.resetModules();
  const fetcher=vi.fn().mockImplementation(async()=>Response.json([
    {display_name:"میدان نقش جهان",lat:"32.6581024",lon:"51.6773624",type:"square"},
  ]));
  vi.stubGlobal("fetch",fetcher);
  const {searchPlaces}=await import("./geocoding");
  const result=await searchPlaces("Naqsh-e Jahan Square","en",5,"isfahan");
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("q")).toBe("میدان نقش جهان");
  expect(result[0]).toMatchObject({lat:32.6581024,lng:51.6773624});
});
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
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("viewbox")!.split(",").map(Number)).toEqual([59.35,36.10,59.85,36.50]);
  expect(mashhad.map(p=>p.displayName)).toEqual(["Mashhad place"]);
  await searchPlaces("Museum","en",5,"mashhad");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("finds the English Mashhad example using its indexed Persian name without changing Tehran queries",async()=>{
  vi.resetModules();
  const fetcher=vi.fn().mockImplementation(async()=>Response.json([
    {display_name:"آرامگاه نادرشاه افشار",lat:"36.2949187",lon:"59.6103948",type:"museum"},
  ]));
  vi.stubGlobal("fetch",fetcher);
  const {searchPlaces}=await import("./geocoding");
  const places=await searchPlaces("Nader Shah Tomb","en",5,"mashhad");
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("q")).toBe("آرامگاه نادرشاه");
  expect(places[0]).toMatchObject({lat:36.2949187,lng:59.6103948});
  await searchPlaces("Nader Shah Tomb","en",5,"tehran");
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("q")).toBe("Nader Shah Tomb");
});
