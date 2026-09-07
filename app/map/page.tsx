import type { Metadata } from "next";
import { Suspense } from "react";
import { MapPage } from "./client";

export const metadata: Metadata = {
  title: "نقشه مترو تهران",
  description:
    "نقشه تعاملی مترو تهران با نمای ماهواره‌ای و نقشه خطوط. تمام ایستگاه‌ها، خطوط و اطلاعات مسیریابی.",
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
      "نقشه تعاملی مترو تهران با نمای ماهواره‌ای و نقشه خطوط.",
    url: "https://metto.ir/map",
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

export default function MapRoute() {
  return (
    <Suspense>
      <MapPage />
    </Suspense>
  );
}
