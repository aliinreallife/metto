import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import AppLayout from "@/app/(app)/layout";
import { StationGuideContent } from "@/components/station-guide-content";
import { getOperationalNeighbors } from "@/lib/metro/selectors";
import {
  SEO_STATIONS, absoluteSeoUrl,
  breadcrumbsJsonLd, getSeoStation, safeJsonLd, stationJsonLd, stationSeoPath,
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
  const description = `اطلاعات ایستگاه مترو ${station.name.fa} تهران؛ خطوط فعال، امکانات ثبت‌شده، زمان‌بندی‌های موجود و مسیریابی در متو.`;
  return {
    title: `ایستگاه مترو ${station.name.fa} | خطوط، امکانات و مسیریابی`,
    description,
    alternates: { canonical: stationSeoPath(station.id) },
    openGraph: {
      title: `ایستگاه مترو ${station.name.fa} | متو`,
      description,
      url: absoluteSeoUrl(stationSeoPath(station.id)),
    },
  };
}

export default async function StationGuide({ params }: Props) {
  const station = await resolveStation(params);
  const neighbors = [...new Set(getOperationalNeighbors(station.id).map(n => n.stationId))]
    .map(id => getSeoStation(id))
    .filter((neighbor): neighbor is NonNullable<typeof neighbor> => Boolean(neighbor))
    .map(({ id, name }) => ({ id, name }));

  // Breadcrumbs mirror the station list > detail flow visible in the app.
  const crumbs = [
    { name: "ایستگاه‌های مترو تهران", href: "/stations" },
    { name: station.name.fa, href: stationSeoPath(station.id) },
  ];
  const jsonLd = [breadcrumbsJsonLd(crumbs), stationJsonLd(station)];

  return (
    <Suspense>
      <AppLayout>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-background text-foreground">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
          <StationGuideContent station={station} neighbors={neighbors} />
        </div>
      </AppLayout>
    </Suspense>
  );
}
