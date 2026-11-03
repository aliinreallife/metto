import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WelcomePage } from "../(landing)/welcome-page";
import { availableCities } from "@/lib/city-availability";
import { CityPreviewNotice } from "@/components/city-preview-notice";
export const dynamicParams = false;
export function generateStaticParams() { return availableCities().map(c => ({ city: c.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params; const meta = availableCities().find(c => c.slug === city);
  if (!meta) notFound();
  return { title: `مترو ${meta.name.fa} | نقشه، ایستگاه‌ها و مسیریابی`,
    description: `نقشه و ایستگاه‌های مترو ${meta.name.fa} را ببین و مسیرت را پیدا کن.`,
    keywords: meta.keywords, alternates: { canonical: `/${city}` },
    ...(meta.release === "preview" ? { robots: { index: false, follow: false } } : {}),
  };
}
export default async function CityLanding({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params; const meta = availableCities().find(c => c.slug === city);
  if (!meta) notFound();
  return <><CityPreviewNotice city={meta.slug} /><WelcomePage cityId={meta.slug} /></>;
}
