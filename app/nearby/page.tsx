import type { Metadata } from "next";
import { NearbyPage } from "./client";

export const metadata: Metadata = {
  title: "نزدیک‌ترین ایستگاه مترو تهران",
  description:
    "نزدیک‌ترین ایستگاه مترو تهران را با GPS پیدا کنید. فیلتر امکانات ایستگاه‌ها شامل سرویس بهداشتی، آسانسور، پارکینگ و بیشتر.",
  alternates: {
    canonical: "/nearby",
    languages: {
      en: "/nearby?lang=en",
      fa: "/nearby",
    },
  },
  openGraph: {
    title: "نزدیک‌ترین ایستگاه مترو | متو",
    description:
      "نزدیک‌ترین ایستگاه مترو تهران را با GPS پیدا کنید.",
    url: "https://metto.ir/nearby",
    images: [
      {
        url: "/socialprev.png",
        width: 1734,
        height: 907,
        alt: "متو - مسیریاب مترو تهران",
        type: "image/png",
      },
    ],
  },
};

export default function NearbyRoute() {
  return <NearbyPage />;
}
