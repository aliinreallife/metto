import type { Metadata } from "next";
import { HomePage } from "./home-page";

export const metadata: Metadata = {
  title: "مسیریابی مترو تهران",
  description:
    "مسیریابی هوشمند مترو تهران — سریع‌ترین مسیر را بین ایستگاه‌های مترو پیدا کنید. زمان سفر، تعداد ایستگاه و تعداد جابجایی را مشاهده کنید.",
  alternates: {
    canonical: "/",
    languages: {
      en: "/?lang=en",
      fa: "/",
    },
  },
  openGraph: {
    title: "مسیریابی مترو تهران | متو",
    description:
      "مسیریابی هوشمند مترو تهران — سریع‌ترین مسیر را بین ایستگاه‌ها پیدا کنید.",
    url: "https://metto.ir",
  },
};

export default function Page() {
  return <HomePage />;
}
