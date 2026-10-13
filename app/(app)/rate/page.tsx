import type { Metadata } from "next";
import { RatePage } from "./client";

export const metadata: Metadata = {
  title: "امتیاز به متو",
  description:
    "به متو امتیاز بدهید: کافه‌بازار یا مایکت را انتخاب کنید تا صفحه متو باز شود.",
  alternates: {
    canonical: "/rate",
  },
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    title: "امتیاز به متو | متو",
    description:
      "کافه‌بازار یا مایکت را انتخاب کنید تا صفحه متو باز شود و امتیاز بدهید.",
    url: "https://metto.ir/rate",
  },
  twitter: {
    card: "summary_large_image",
    title: "امتیاز به متو | متو",
    description:
      "کافه‌بازار یا مایکت را انتخاب کنید تا صفحه متو باز شود و امتیاز بدهید.",
    images: ["/socialprev.png"],
  },
};

export default function RateRoute() {
  return <RatePage />;
}
