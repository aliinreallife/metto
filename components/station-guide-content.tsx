"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, Navigation, TrainFront } from "lucide-react";
import { useMetro } from "@/app/providers";
import { StationDetail } from "@/components/station-detail";
import { geoUrl } from "@/lib/geo";
import { stationSeoPath } from "@/lib/station-seo";
import type { MetroStation } from "@/lib/metro/types";

export function StationGuideContent({
  station,
  neighbors,
}: {
  station: MetroStation;
  neighbors: { id: string; name: MetroStation["name"] }[];
}) {
  const { lang } = useMetro();
  const isFa = lang === "fa";
  const BackIcon = isFa ? ArrowRight : ArrowLeft;
  const listUrl = `/stations?lang=${lang}`;

  return (
    <div dir={isFa ? "rtl" : "ltr"} className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 pb-8 sm:py-6">
      <nav aria-label={isFa ? "مسیر صفحه" : "Breadcrumb"} className="flex items-center justify-between gap-3">
        <Link href={listUrl} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
          <BackIcon aria-hidden="true" className="size-4" />
          {isFa ? "بازگشت به ایستگاه‌ها" : "Back to stations"}
        </Link>
        <span className="text-xs text-muted-foreground">{isFa ? "مترو تهران" : "Tehran Metro"}</span>
      </nav>

      {/* The same colored line chips, verified amenities and live departures as the map sheet. */}
      <StationDetail station={station} lang={lang} headingLevel="h1" fullTitle />

      <section aria-labelledby="guide-actions" className="rounded-xl border border-border bg-card p-4">
        <h2 id="guide-actions" className="mb-2 text-sm font-bold">{isFa ? "مسیریابی و نقشه" : "Route and map"}</h2>
        <p className="mb-4 text-xs leading-6 text-muted-foreground">
          {isFa
            ? "برای رسیدن به این ایستگاه، مسیرت را در متو پیدا کن یا موقعیت ایستگاه را روی نقشه ببین."
            : "Plan your journey to this station or locate it on the map."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={`/tehran/route?to=${encodeURIComponent(station.id)}&lang=${lang}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary">
            <Navigation aria-hidden="true" className="size-4" />
            {isFa ? "مسیریابی به این ایستگاه" : "Route to this station"}
          </Link>
          <Link href={`/tehran/map?station=${encodeURIComponent(station.id)}&lang=${lang}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-center text-sm font-semibold transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
            <TrainFront aria-hidden="true" className="size-4" />
            {isFa ? "نمایش روی نقشهٔ متو" : "Show on Metto map"}
          </Link>
        </div>
        <a
          href={geoUrl(station.location, isFa ? station.name.fa : station.name.en)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <MapPin aria-hidden="true" className="size-4" />
          {isFa ? "موقعیت و مسیر پیاده در نقشهٔ خارجی" : "Directions in an external map"}
          <span className="sr-only">{isFa ? "(در پنجره جدید)" : "(opens a new tab)"}</span>
        </a>
      </section>

      {neighbors.length > 0 && (
        <section aria-labelledby="guide-neighbors" className="rounded-xl border border-border bg-card p-4">
          <h2 id="guide-neighbors" className="mb-3 text-sm font-bold">
            {isFa ? "ایستگاه‌های مجاور در مسیر فعال" : "Adjacent stations on operating tracks"}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {neighbors.map((neighbor) => (
              <li key={neighbor.id}>
                <Link href={`${stationSeoPath(neighbor.id)}?lang=${lang}`} prefetch={false}
                  className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
                  {neighbor.name[lang]}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="px-1 text-xs leading-6 text-muted-foreground">
        {isFa
          ? "اطلاعات امکانات و خطوط از داده‌های ثبت‌شدهٔ متو است. نبودن یک امکان در فهرست، به معنی نبودن آن در ایستگاه نیست."
          : "Lines and facilities are based on Metto's recorded data. Unlisted facilities are not necessarily unavailable."}
      </p>
    </div>
  );
}
