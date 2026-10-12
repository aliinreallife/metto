import type { Metadata } from "next";
import { RatePage } from "./client";

export const metadata: Metadata = {
  title: "امتیاز به متو",
  description:
    "به متو امتیاز بدهید: کافه‌بازار یا مایکت را انتخاب کنید تا صفحه متو باز شود.",
  alternates: {
    canonical: "/rate",
    languages: {
      en: "/rate?lang=en",
      fa: "/rate",
    },
  },
  openGraph: {
    title: "امتیاز به متو | متو",
    description:
      "کافه‌بازار یا مایکت را انتخاب کنید تا صفحه متو باز شود و امتیاز بدهید.",
    url: "https://metto.ir/rate",
  },
};

export default function RateRoute() {
  return <RatePage />;
}
