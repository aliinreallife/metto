import type { Metadata } from "next";
import { use } from "react";
import { notFound } from "next/navigation";
import AppLayout from "@/app/(app)/layout";
import { StationGuideContent } from "@/components/station-guide-content";
import { buildStationGuideModel } from "@/lib/station-guide-model";
import {
  getStationTimetableSummarySync, getRegionalStationTimetableSummarySync,
} from "@/lib/station-seo-timetable";
import { persianDigits } from "@/lib/i18n";
import { getCityMeta } from "@/lib/cities";
import {
  SEO_CITY_STATIONS, absoluteSeoUrl, breadcrumbsJsonLd,
  getSeoCityStation, safeJsonLd, cityStationBreadcrumbs,
  cityStationJsonLd, cityStationPageJsonLd, cityStationSeoPath,
} from "@/lib/station-seo";

type Props = { params: Promise<{ city: string; station: string }> };

export const dynamicParams = false;

/** All published, timed and boardable city stations share this route. */
export function generateStaticParams() {
  return SEO_CITY_STATIONS.map(station => ({
    city: station.cityId,
    station: station.localId,
  }));
}

async function resolveStation(params: Props["params"]) {
  const { city, station: id } = await params;
  const station = getSeoCityStation(city, id);
  if (!station) notFound();
  return station;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const station = await resolveStation(params);
  const city = getCityMeta(station.cityId)!;
  const lines = station.operationalLineIds.map(line => `خط ${persianDigits(line.split(":").at(-1)!, "fa")}`);
  const lineLabel = lines.join(" و ");
  const title = `ایستگاه مترو ${station.names.fa} ${city.name.fa} | ${lineLabel} و برنامه حرکت`;
  const sourceStatus = station.cityId === "tabriz"
    ? " زمان‌بندی منتشرشده تبریز در حال بررسی و تأیید است."
    : station.cityId === "isfahan"
      ? " برنامه جمعه و تعطیلات موقت است."
      : "";
  const description = `ایستگاه مترو ${station.names.fa} در ${city.name.fa}، ${lineLabel}؛ برنامه حرکت قطارها، ایستگاه‌های مجاور و مسیریابی در متو.${sourceStatus}`;
  const url = absoluteSeoUrl(cityStationSeoPath(city.slug, station.localId));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `ایستگاه مترو ${station.names.fa} ${city.name.fa} | متو`,
      description, url, type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `ایستگاه مترو ${station.names.fa} ${city.name.fa} | متو`,
      description,
      images: ["/socialprev.png"],
    },
  };
}

export default function StationGuide({ params }: Props) {
  // Prerendered city/station IDs resolve synchronously. There is no async
  // work in the page body, so Google receives the visible HTML without JS.
  const { city, station: id } = use(params);
  const station = getSeoCityStation(city, id);
  if (!station) notFound();

  const model = buildStationGuideModel(station);
  const tehranSummary = station.cityId === "tehran"
    ? getStationTimetableSummarySync(station.localId) : null;
  const regionalSummaries = station.cityId === "isfahan" || station.cityId === "tabriz"
    ? getRegionalStationTimetableSummarySync(station.cityId, station.id) : undefined;
  const jsonLd = [
    breadcrumbsJsonLd(cityStationBreadcrumbs(station)),
    cityStationPageJsonLd(station),
    cityStationJsonLd(station),
  ];

  return (
    <AppLayout ssrContent>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-background text-foreground">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
        <StationGuideContent station={station} model={model}
          tehranSummary={tehranSummary} regionalSummaries={regionalSummaries} />
      </div>
    </AppLayout>
  );
}
