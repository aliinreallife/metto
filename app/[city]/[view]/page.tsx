import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import AppLayout from "../../(app)/layout";
import { HomePage } from "../../(app)/route/home-page";
import { MapPage } from "../../(app)/map/client";
import { StationsPage } from "../../(app)/stations/client";
import { NearbyPage } from "../../(app)/nearby/client";
import { CityRoute } from "@/components/city-route";
import { CityPreviewNotice } from "@/components/city-preview-notice";
import { getCityMeta } from "@/lib/cities";
import { CityExplorer } from "@/components/city-explorer";
import { availableCities } from "@/lib/city-availability";
const views = ["route", "map", "stations", "nearby"] as const;
export const dynamicParams = false;
export function generateStaticParams() { return availableCities().flatMap(c => views.map(view => ({ city: c.slug, view }))); }
export async function generateMetadata({ params }: { params: Promise<{ city: string; view: string }> }): Promise<Metadata> {
  const { city, view } = await params; const meta = availableCities().find(c => c.slug === city);
  if (!meta || !views.some(v => v === view)) notFound();
  const labels = { route: "مسیریابی", map: "نقشه", stations: "ایستگاه‌ها", nearby: "نزدیک‌ترین ایستگاه" };
  // Root app tabs and /tehran/* show the same Tehran content. Always
  // nominate the original root tab as canonical while preserving historic
  // /tehran/* URLs for bookmarked journeys and existing navigation.
  const canonical = city === "tehran" ? `/${view}` : `/${city}/${view}`;
  const title = `${labels[view as keyof typeof labels]} · مترو ${meta.name.fa}`;
  const description = `${labels[view as keyof typeof labels]} مترو ${meta.name.fa} در متو؛ اطلاعات خطوط و ایستگاه‌ها و مسیریابی مترو.`;
  return {
    title, description,
    alternates: { canonical },
    openGraph: { title, description, url: `https://metto.ir${canonical}` },
    ...(meta.release === "preview" ? { robots: { index: false, follow: false } } : {}),
  };
}
export default async function CityApp({ params }: { params: Promise<{ city: string; view: string }> }) {
  const { city, view } = await params;
  if (!availableCities().some(c => c.slug === city) || !views.some(v => v === view)) notFound();
  let content;
  if (city === "tehran") content = view === "route" ? <HomePage /> : view === "map" ? <MapPage /> : view === "stations" ? <StationsPage /> : <NearbyPage />;
  else {
    const meta = getCityMeta(city)!;
    if (meta.slug === "tehran") notFound();
    content = view === "route" ? <CityRoute key={city} city={meta.slug} embedded /> : <CityExplorer city={meta.slug} view={view as "map" | "stations" | "nearby"} />;
  }
  return <Suspense><AppLayout><CityPreviewNotice city={getCityMeta(city)!.slug} />{content}</AppLayout></Suspense>;
}
