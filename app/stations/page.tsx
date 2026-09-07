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
    images: [
      {
        url: "/socialprev.png",
        width: 1731,
        height: 909,
        alt: "متو - مسیریاب مترو تهران",
        type: "image/png",
      },
    ],
  },
};

export default function StationsRoute() {
  return <StationsPage />;
}
