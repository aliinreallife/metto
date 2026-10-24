import type { Metadata } from "next";
import { Suspense } from "react";
import AppLayout from "../../(app)/layout";
import { CityExplorer } from "@/components/city-explorer";
export const metadata: Metadata = { title: "نزدیک‌ترین ایستگاه مترو در شهرهای ایران", alternates: { canonical: "/cities/nearby" } };
export default function GlobalNearby() { return <Suspense><AppLayout><CityExplorer city="all" view="nearby" /></AppLayout></Suspense>; }
