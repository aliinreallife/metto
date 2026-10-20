import type { Metadata } from "next";
import { NearbyPage } from "./client";

export const metadata: Metadata = {
  // TODO(multi-city): Tehran-scoped until /[city]/nearby lands.
  title: "نزدیک‌ترین ایستگاه مترو به من | فاصله و مسیر",
  description:
    "با موقعیت مکانی یا انتخاب ایستگاه، نزدیک‌ترین ایستگاه مترو تهران را پیدا کن و فاصله، مسیر و امکاناتی مثل آسانسور و سرویس بهداشتی را ببین.",
  alternates: {
    canonical: "/nearby",
  },
  openGraph: {
    title: "نزدیک‌ترین ایستگاه مترو به من | فاصله و مسیر | متو",
    description:
      "نزدیک‌ترین ایستگاه مترو تهران را با فاصله، مسیر و امکانات ایستگاه پیدا کن.",
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
    title: "نزدیک‌ترین ایستگاه مترو به من | فاصله و مسیر | متو",
    description:
      "نزدیک‌ترین ایستگاه مترو تهران را با فاصله، مسیر و امکانات ایستگاه پیدا کن.",
    images: ["/socialprev.png"],
  },
};

export default function NearbyRoute() {
  return <NearbyPage />;
}
