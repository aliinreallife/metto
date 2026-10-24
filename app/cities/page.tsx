import type { Metadata } from "next";
import { Suspense } from "react";
import AppLayout from "../(app)/layout";
import { CityExplorer } from "@/components/city-explorer";
export const metadata: Metadata = { title: "ایستگاه‌های مترو در همهٔ شهرها", alternates: { canonical: "/cities" } };
export default function AllCities() { return <Suspense><AppLayout><CityExplorer city="all" view="stations" /></AppLayout></Suspense>; }
