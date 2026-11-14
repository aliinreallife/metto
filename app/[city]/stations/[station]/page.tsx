import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LINES } from "@/lib/metro/lines";
import { getOperationalStationLines, getOperationalNeighbors } from "@/lib/metro/selectors";
import { AMENITY_LABELS } from "@/lib/i18n";
import {
  SEO_STATIONS, STATION_DIRECTORY_PATH, absoluteSeoUrl,
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
  const description = `اطلاعات ایستگاه مترو ${station.name.fa} تهران؛ خطوط فعال، امکانات ثبت‌شده، موقعیت روی نقشه و لینک مسیریابی در متو.`;
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
  const activeLines = getOperationalStationLines(station.id)
    .map((id) => LINES.find((line) => line.id === id))
    .filter((line): line is (typeof LINES)[number] => Boolean(line));
  // Never claim an unknown or unverified facility is available.
  const confirmedAmenities = station.amenitiesVerified === false ? [] :
    Object.entries(station.amenities)
      .filter(([, value]) => value === true)
      .map(([key]) => AMENITY_LABELS[key as keyof typeof AMENITY_LABELS]?.fa)
      .filter((name): name is string => Boolean(name));
  const neighboringIds = [...new Set(
    getOperationalNeighbors(station.id).map(neighbor => neighbor.stationId),
  )].filter(id => Boolean(getSeoStation(id)));
  const crumbs = [
    { name: "متو", href: "/" },
    { name: "مترو تهران", href: "/tehran" },
    { name: "راهنمای ایستگاه‌ها", href: STATION_DIRECTORY_PATH },
    { name: station.name.fa, href: stationSeoPath(station.id) },
  ];
  const jsonLd = [breadcrumbsJsonLd(crumbs), stationJsonLd(station)];

  return (
    <main dir="rtl" className="min-h-0 flex-1 overflow-y-auto bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
        <nav aria-label="مسیر صفحه" className="mb-8 text-xs text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-2">
            {crumbs.map((crumb, index) => (
              <li key={crumb.href} className="flex items-center gap-2">
                {index > 0 && <span aria-hidden="true">/</span>}
                {index === crumbs.length - 1
                  ? <span aria-current="page" className="font-semibold text-foreground">{crumb.name}</span>
                  : <Link href={crumb.href} className="underline-offset-4 hover:text-primary hover:underline">{crumb.name}</Link>}
              </li>
            ))}
          </ol>
        </nav>

        <header className="mb-8">
          <p className="mb-2 text-sm font-semibold text-primary">راهنمای ایستگاه‌های مترو تهران</p>
          <h1 className="text-2xl font-extrabold leading-relaxed sm:text-3xl">ایستگاه مترو {station.name.fa}</h1>
          <p className="mt-1 text-sm text-muted-foreground" lang="en" dir="ltr">{station.name.en}</p>
          <p className="mt-4 leading-8 text-muted-foreground">
            اطلاعات خطوط فعال و امکانات ثبت‌شدهٔ این ایستگاه را ببین و برای پیدا کردن مسیر، وارد مسیریاب متو شو.
          </p>
        </header>

        <section aria-labelledby="station-lines" className="mb-5 rounded-2xl border border-border bg-card p-5">
          <h2 id="station-lines" className="mb-4 text-lg font-bold">خطوط فعال</h2>
          <ul className="flex flex-wrap gap-2">
            {activeLines.map((line) => (
              <li key={line.id} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
                {line.name.fa}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="station-amenities" className="mb-5 rounded-2xl border border-border bg-card p-5">
          <h2 id="station-amenities" className="mb-3 text-lg font-bold">امکانات ثبت‌شده</h2>
          {confirmedAmenities.length
            ? <ul className="flex flex-wrap gap-2">{confirmedAmenities.map((label) => (
              <li key={label} className="rounded-lg bg-muted px-3 py-2 text-sm">{label}</li>
            ))}</ul>
            : <p className="text-sm leading-7 text-muted-foreground">اطلاعات تأییدشده‌ای برای نمایش امکانات این ایستگاه نداریم.</p>}
          <p className="mt-3 text-xs text-muted-foreground">فقط امکانات ثبت‌شده نمایش داده می‌شوند؛ نبودن یک مورد به معنی نبودن آن در ایستگاه نیست.</p>
        </section>

        <section aria-labelledby="station-location" className="mb-5 rounded-2xl border border-border bg-card p-5">
          <h2 id="station-location" className="mb-3 text-lg font-bold">موقعیت ایستگاه</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            مختصات ثبت‌شده در نقشه: <span dir="ltr" className="inline-block tabular-nums">{station.location.lat.toFixed(5)}, {station.location.lng.toFixed(5)}</span>
          </p>
        </section>

        {neighboringIds.length > 0 && (
          <section aria-labelledby="station-neighbors" className="mb-5 rounded-2xl border border-border bg-card p-5">
            <h2 id="station-neighbors" className="mb-3 text-lg font-bold">ایستگاه‌های مجاور در خطوط فعال</h2>
            <ul className="flex flex-wrap gap-2">
              {neighboringIds.map(id => (
                <li key={id}>
                  <Link className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary" href={stationSeoPath(id)}>
                    {getSeoStation(id)!.name.fa}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="station-actions" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="station-actions" className="mb-2 text-lg font-bold">مسیریابی و نقشه</h2>
          <p className="mb-4 text-sm leading-7 text-muted-foreground">
            برای انتخاب مبدأ، مشاهدهٔ مسیر یا بررسی زمان‌بندی‌های موجود، از برنامهٔ اصلی متو استفاده کن.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary" href={`/tehran/route?to=${encodeURIComponent(station.id)}`}>
              مسیریابی به این ایستگاه
            </Link>
            <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-5 py-3 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary" href={`/tehran/map?station=${encodeURIComponent(station.id)}`}>
              نمایش روی نقشهٔ متو
            </Link>
          </div>
        </section>

        <nav aria-label="پیوندهای دیگر" className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link className="text-primary underline-offset-4 hover:underline" href={STATION_DIRECTORY_PATH}>همهٔ ایستگاه‌های تهران</Link>
          <Link className="text-primary underline-offset-4 hover:underline" href="/stations">فهرست و زمان‌بندی در برنامه</Link>
        </nav>
      </div>
    </main>
  );
}
