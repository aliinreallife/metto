import type { Metadata } from "next";
import { StationsPage } from "./client";

export const metadata: Metadata = {
  // TODO(multi-city): Tehran-scoped until /[city]/stations lands.
  title: "ایستگاه‌های مترو تهران",
  description:
    "لیست ایستگاه‌های مترو تهران با خطوط، زمان‌بندی و امکاناتی مثل آسانسور، سرویس بهداشتی، نمازخانه و پارکینگ.",
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
      "ایستگاه‌های مترو تهران را با اطلاعات خطوط، زمان‌بندی و امکانات ایستگاه‌ها ببینید.",
    url: "https://metto.ir/stations",
    images: [
      {
        url: "/socialprev.png",
        width: 1731,
        height: 909,
        alt: "متو - مسیریاب مترو",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ایستگاه‌های مترو تهران | متو",
    description:
      "ایستگاه‌های مترو تهران را با اطلاعات خطوط، زمان‌بندی و امکانات ایستگاه‌ها ببینید.",
    images: ["/socialprev.png"],
  },
};

export default function StationsRoute() {
  return <StationsPage />;
}
