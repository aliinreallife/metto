import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import AppLayout from "@/app/(app)/layout";
import { StationGuideContent } from "@/components/station-guide-content";
import { getOperationalNeighbors, getOperationalStationLines, getRouteStations } from "@/lib/metro/selectors";
import { getStationTimetableSummary } from "@/lib/station-seo-timetable";
import {
  SEO_STATIONS, SEO_CITY, absoluteSeoUrl,
  breadcrumbsJsonLd, getSeoStation, safeJsonLd, stationBreadcrumbs,
  stationJsonLd, stationPageJsonLd, stationSeoPath,
} from "@/lib/station-seo";

type Props = { params: Promise<{ city: string; station: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return SEO_STATIONS.map((station) => ({ city: "tehran", station: station.id }));
}

async function resolveStation(params: Props["params"]) {
  const { city, station: id } = await params;
  if (city !== "tehran") notFound();
  const station = getSeoStation(id);
  if (!station) notFound();
  return station;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const station = await resolveStation(params);
  const lines = getOperationalStationLines(station.id);
  const lineLabel = lines.map(line => `خط ${line}`).join(" و ");
  const title = `ایستگاه مترو ${station.name.fa} ${SEO_CITY.name.fa} | ${lineLabel} و برنامه حرکت`;
  const description = `ایستگاه مترو ${station.name.fa} در ${SEO_CITY.name.fa}، ${lineLabel}؛ برنامه حرکت قطارها برای روزهای مختلف، امکانات ثبت‌شده، ایستگاه‌های مجاور و مسیریابی در متو.`;
  const url = absoluteSeoUrl(stationSeoPath(station.id));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `ایستگاه مترو ${station.name.fa} ${SEO_CITY.name.fa} | متو`,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `ایستگاه مترو ${station.name.fa} ${SEO_CITY.name.fa} | متو`,
      description,
      images: ["/socialprev.png"],
    },
  };
}

export default async function StationGuide({ params }: Props) {
  const station = await resolveStation(params);
  const neighbors = getOperationalNeighbors(station.id)
    .flatMap((edge) => {
      const neighbor = getSeoStation(edge.stationId);
      if (!neighbor) return [];
      const routeStops = getRouteStations(edge.routeId);
      const index = routeStops.indexOf(station.id);
      const adjacentIndex = routeStops.indexOf(edge.stationId);
      return [{
        id: neighbor.id,
        name: neighbor.name,
        lineId: edge.lineId,
        side: adjacentIndex < index ? "before" as const : "after" as const,
      }];
    })
    .filter((neighbor, index, all) =>
      all.findIndex(other => other.id === neighbor.id && other.lineId === neighbor.lineId) === index);

  // Static timetable facts are available in source HTML for people and
  // crawlers; the interactive component upgrades them with hot-updated data.
  const timetableSummary = await getStationTimetableSummary(station.id);
  const jsonLd = [
    breadcrumbsJsonLd(stationBreadcrumbs(station)),
    stationPageJsonLd(station),
    stationJsonLd(station),
  ];

  return (
    <Suspense>
      <AppLayout>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-background text-foreground">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
          <StationGuideContent station={station} neighbors={neighbors} timetableSummary={timetableSummary} />
        </div>
      </AppLayout>
    </Suspense>
  );
}
