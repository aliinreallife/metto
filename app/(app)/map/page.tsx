import type { Metadata } from "next";
import { Suspense } from "react";
import { MapPage } from "./client";

export const metadata: Metadata = {
  // TODO(multi-city): Tehran-scoped until /[city]/map lands.
  title: "نقشه مترو تهران",
  description:
    "نقشه آنلاین خطوط و ایستگاه‌های مترو تهران را ببین، اطلاعات ایستگاه‌ها را بررسی کن و مستقیم وارد مسیریابی شو.",
  alternates: {
    canonical: "/map",
    languages: {
      en: "/map?lang=en",
      fa: "/map",
    },
  },
  openGraph: {
    title: "نقشه مترو تهران | متو",
    description:
      "نقشه آنلاین خطوط و ایستگاه‌های مترو تهران با دسترسی مستقیم به مسیریابی.",
    url: "https://metto.ir/map",
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
    title: "نقشه مترو تهران | متو",
    description:
      "نقشه آنلاین خطوط و ایستگاه‌های مترو تهران با دسترسی مستقیم به مسیریابی.",
    images: ["/socialprev.png"],
  },
};

export default function MapRoute() {
  return (
    <Suspense>
      <MapPage />
    </Suspense>
  );
}
