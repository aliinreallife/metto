import type { Metadata } from "next";
import { PrivacyPage } from "./client";

export const metadata: Metadata = {
  title: "حریم خصوصی",
  description:
    "حریم خصوصی متو: موقعیت مکانی فقط برای ایستگاه‌های نزدیک، بدون حساب کاربری، آمار فنی پایه و سرویس‌های شخص ثالث.",
  alternates: {
    canonical: "/privacy",
    languages: {
      en: "/privacy?lang=en",
      fa: "/privacy",
    },
  },
  openGraph: {
    title: "حریم خصوصی | متو",
    description:
      "موقعیت مکانی فقط برای پیدا کردن ایستگاه‌های نزدیک استفاده می‌شود. بدون ثبت‌نام، بدون حساب کاربری.",
    url: "https://metto.ir/privacy",
  },
};

export default function PrivacyRoute() {
  return <PrivacyPage />;
}
