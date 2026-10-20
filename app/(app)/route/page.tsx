import type { Metadata } from "next";
import { Suspense } from "react";
import { HomePage } from "./home-page";

export const metadata: Metadata = {
  // TODO(multi-city): this route currently serves Tehran data. When /[city]
  // routes land, move this Tehran-scoped title/description there and make
  // this root generic.
  title: "مسیریاب مترو تهران | زمان رسیدن و قطار بعدی",
  description:
    "مبدأ و مقصد را انتخاب کن؛ بهترین مسیر مترو تهران، زمان تقریبی رسیدن، تعویض خط و قطار بعدی را ببین. رایگان و بدون تبلیغ.",
  alternates: {
    canonical: "https://metto.ir/route",
  },
  openGraph: {
    title: "مسیریاب مترو تهران | زمان رسیدن و قطار بعدی | متو",
    description:
      "بهترین مسیر مترو تهران را با زمان تقریبی رسیدن، تعویض خط و قطار بعدی پیدا کن.",
    url: "https://metto.ir/route",
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
  twitter: {
    card: "summary_large_image",
    title: "مسیریاب مترو تهران | زمان رسیدن و قطار بعدی | متو",
    description:
      "بهترین مسیر مترو تهران را با زمان تقریبی رسیدن، تعویض خط و قطار بعدی پیدا کن.",
    images: ["/socialprev.png"],
  },
};

export default function Page() {
  // Explicit null fallback: a bare <Suspense> bubbles to the nearest
  // loading.js, flashing hardcoded English ("Loading...") in both
  // languages while the client resolves search params. Null renders
  // nothing until hydration fills the planner in.
  return (
    <>
      <h1 className="sr-only">مسیریاب مترو تهران با زمان رسیدن</h1>
      <p className="sr-only">
        مسیر مترو تهران را با زمان تقریبی رسیدن، تعویض خط و قطار بعدی پیدا کن.
      </p>
      <Suspense fallback={null}>
        <HomePage />
      </Suspense>
    </>
  );
}
