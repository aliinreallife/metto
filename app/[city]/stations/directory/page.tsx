import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LINES } from "@/lib/metro/lines";
import { getOperationalStationLines } from "@/lib/metro/selectors";
import { persianDigits } from "@/lib/i18n";
import {
  SEO_STATIONS, STATION_DIRECTORY_PATH,
  breadcrumbsJsonLd, safeJsonLd, stationSeoPath,
} from "@/lib/station-seo";

type Props = { params: Promise<{ city: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ city: "tehran" }];
}

export const metadata: Metadata = {
  title: "راهنمای ایستگاه‌های مترو تهران | خطوط و امکانات",
  description: "فهرست ایستگاه‌های فعال مترو تهران، خطوط هر ایستگاه، امکانات ثبت‌شده، نقشه و پیوند مستقیم به مسیریاب متو.",
  alternates: { canonical: STATION_DIRECTORY_PATH },
  openGraph: { url: "https://metto.ir/tehran/stations/directory" },
};

export default async function TehranStationDirectory({ params }: Props) {
  const { city } = await params;
  if (city !== "tehran") notFound();

  const crumbs = [
    { name: "متو", href: "/" },
    { name: "مترو تهران", href: "/tehran" },
    { name: "راهنمای ایستگاه‌ها", href: STATION_DIRECTORY_PATH },
  ];
  const lines = LINES.map((line) => ({
    line,
    stations: SEO_STATIONS.filter((station) =>
      getOperationalStationLines(station.id).includes(line.id))
      .sort((a, b) => a.name.fa.localeCompare(b.name.fa, "fa")),
  })).filter((group) => group.stations.length > 0);

  return (
    <main dir="rtl" className="min-h-0 flex-1 overflow-y-auto bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbsJsonLd(crumbs)) }} />
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
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
        <header className="mb-7">
          <h1 className="text-2xl font-extrabold leading-relaxed sm:text-3xl">راهنمای ایستگاه‌های مترو تهران</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {persianDigits(SEO_STATIONS.length, "fa")} ایستگاه فعال با جزئیات خطوط و امکانات ثبت‌شده. برای جست‌وجوی سریع، فیلتر امکانات و زمان‌بندی، از <Link href="/stations" className="font-semibold text-primary underline-offset-4 hover:underline">فهرست تعاملی ایستگاه‌ها</Link> استفاده کن.
          </p>
        </header>
        <nav aria-label="پرش به خط مترو" className="mb-8 flex flex-wrap gap-2">
          {lines.map(({ line }) => (
            <a key={line.id} href={`#line-${line.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary hover:text-primary">
              {line.name.fa}
            </a>
          ))}
        </nav>
        <div className="space-y-8">
          {lines.map(({ line, stations }) => (
            <section key={line.id} id={`line-${line.id}`} aria-labelledby={`line-title-${line.id}`} className="scroll-mt-6 rounded-2xl border border-border bg-card p-5">
              <h2 id={`line-title-${line.id}`} className="mb-4 text-lg font-bold">{line.name.fa}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {stations.map((station) => (
                  <li key={station.id}>
                    <Link href={stationSeoPath(station.id)} className="flex min-h-11 items-center rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
                      {station.name.fa}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/tehran/route" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:brightness-110">شروع مسیریابی</Link>
        </div>
      </div>
    </main>
  );
}
