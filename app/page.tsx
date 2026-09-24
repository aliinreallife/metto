import type { Metadata } from "next";
import { Suspense } from "react";
import { HomePage } from "./home-page";

export const metadata: Metadata = {
  // TODO(multi-city): this route currently serves Tehran data. When /[city]
  // routes land, move this Tehran-scoped title/description there and make
  // this root generic.
  title: "متو | مسیریاب مترو تهران، زمان قطار بعدی و تخمین رسیدن",
  description:
    "با متو مسیر متروی تهران را پیدا کن، زمان رسیدن و قطار بعدی را ببین، مسیرت را به اشتراک بگذار و نزدیک‌ترین راه تا ایستگاه شروع را پیدا کن.",
  alternates: {
    canonical: "https://metto.ir",
    languages: {
      en: "/?lang=en",
      fa: "/",
    },
  },
  openGraph: {
    title: "متو | مسیریاب مترو تهران، زمان قطار بعدی و تخمین رسیدن",
    description:
      "با متو مسیر متروی تهران را پیدا کن، زمان رسیدن و قطار بعدی را ببین، مسیرت را به اشتراک بگذار و نزدیک‌ترین راه تا ایستگاه شروع را پیدا کن.",
    url: "https://metto.ir",
    siteName: "متو",
    locale: "fa_IR",
    type: "website",
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
};

export default function Page() {
  return (
    <Suspense>
      <HomePage />
    </Suspense>
  );
}
