import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { mashhadPreviewEnabled } from "@/lib/mashhad-preview-access";
import { MashhadPreview } from "./preview";

export const metadata: Metadata = {
  title: "مترو مشهد · پیش‌نمایش بررسی مسیرها",
  description: "پیش‌نمایش بررسی ایستگاه‌ها و مسیرهای خطوط ۱ و ۲ مترو مشهد؛ بدون برآورد زمان سفر.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/mashhad" },
};

export default async function MashhadPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string; lang?: string }>;
}) {
  await connection();
  if (!mashhadPreviewEnabled()) notFound();
  const params = await searchParams;
  return <MashhadPreview initialFrom={params.from} initialTo={params.to}
    initialLang={params.lang === "en" || params.lang === "fa" ? params.lang : undefined} />;
}
