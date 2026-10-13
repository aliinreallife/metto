import type { Metadata } from "next";
import { NearbyPage } from "./client";

export const metadata: Metadata = {
  // TODO(multi-city): Tehran-scoped until /[city]/nearby lands.
  title: "مترو نزدیک من",
  description:
    "نزدیک‌ترین ایستگاه مترو به موقعیتت را با GPS پیدا کن و فاصله و امکانات ایستگاه را ببین.",
  alternates: {
    canonical: "/nearby",
    languages: {
      en: "/nearby?lang=en",
      fa: "/nearby",
    },
  },
  openGraph: {
    title: "مترو نزدیک من | متو",
    description:
      "نزدیک‌ترین ایستگاه مترو به موقعیتت را با GPS پیدا کن.",
    url: "https://metto.ir/nearby",
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
    title: "مترو نزدیک من | متو",
    description:
      "نزدیک‌ترین ایستگاه مترو به موقعیتت را با GPS پیدا کن.",
    images: ["/socialprev.png"],
  },
};

export default function NearbyRoute() {
  return <NearbyPage />;
}
