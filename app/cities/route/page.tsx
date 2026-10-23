import type { Metadata } from "next";
import { Suspense } from "react";
import AppLayout from "../../(app)/layout";
import { AllCityRoute } from "@/components/all-city-route";
export const metadata: Metadata = { title: "مسیریاب مترو شهرهای ایران", alternates: { canonical: "/cities/route" } };
export default function GlobalRoute() { return <Suspense><AppLayout><AllCityRoute /></AppLayout></Suspense>; }
