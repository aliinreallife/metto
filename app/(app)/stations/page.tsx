import type { Metadata } from "next";
import { StationsPage } from "./client";

export const metadata: Metadata = {
  // TODO(multi-city): Tehran-scoped until /[city]/stations lands.
  title: "ایستگاه‌های مترو تهران | امکانات و خطوط",
  description:
    "ایستگاه‌های مترو تهران را با خطوط، زمان‌بندی و امکاناتی مثل آسانسور، سرویس بهداشتی، نمازخانه و پارکینگ جستجو و بررسی کن.",
  alternates: {
    canonical: "/stations",
  },
  openGraph: {
    title: "ایستگاه‌های مترو تهران | امکانات و خطوط | متو",
    description:
      "ایستگاه‌های مترو تهران را با خطوط، زمان‌بندی و امکانات هر ایستگاه جستجو و بررسی کن.",
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
    title: "ایستگاه‌های مترو تهران | امکانات و خطوط | متو",
    description:
      "ایستگاه‌های مترو تهران را با خطوط، زمان‌بندی و امکانات هر ایستگاه جستجو و بررسی کن.",
    images: ["/socialprev.png"],
  },
};

export default function StationsRoute() {
  return <StationsPage />;
}
