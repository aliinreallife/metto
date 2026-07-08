import type { Metadata } from "next";
import { StationsPage } from "./client";

export const metadata: Metadata = {
  title: "ایستگاه‌های مترو تهران",
  description:
    "لیست کامل ایستگاه‌های مترو تهران با اطلاعات خطوط، امکانات و زمان‌بندی حرکت قطارها.",
  alternates: {
    canonical: "/stations",
    languages: {
      en: "/stations?lang=en",
      fa: "/stations",
    },
  },
  openGraph: {
    title: "ایستگاه‌های مترو تهران | متو",
    description:
      "لیست کامل ایستگاه‌های مترو تهران با اطلاعات خطوط و امکانات.",
    url: "https://metto.ir/stations",
  },
};

export default function StationsRoute() {
  return <StationsPage />;
}
