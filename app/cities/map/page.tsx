import type { Metadata } from "next";
import { Suspense } from "react";
import AppLayout from "../../(app)/layout";
import { CityExplorer } from "@/components/city-explorer";
export const metadata: Metadata = { title: "نقشه مترو در همهٔ شهرها", alternates: { canonical: "/cities/map" } };
export default function AllCitiesMap() { return <Suspense><AppLayout><CityExplorer city="all" view="map" /></AppLayout></Suspense>; }
