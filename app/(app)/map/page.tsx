import type { Metadata } from "next";
import { Suspense } from "react";
import { MapPage } from "./client";

export const metadata: Metadata = {
  // TODO(multi-city): Tehran-scoped until /[city]/map lands.
  title: "نقشه مترو تهران آنلاین | خطوط و ایستگاه‌ها",
  description:
    "نقشه آنلاین خطوط و ایستگاه‌های مترو تهران را ببین، ایستگاه‌ها و خطوط را بررسی کن و مستقیم از روی نقشه وارد مسیریابی شو.",
  alternates: {
    canonical: "/map",
  },
  openGraph: {
    title: "نقشه مترو تهران آنلاین | خطوط و ایستگاه‌ها | متو",
    description:
      "نقشه آنلاین خطوط و ایستگاه‌های مترو تهران با دسترسی مستقیم به اطلاعات ایستگاه و مسیریابی.",
    url: "https://metto.ir/map",
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
    title: "نقشه مترو تهران آنلاین | خطوط و ایستگاه‌ها | متو",
    description:
      "نقشه آنلاین خطوط و ایستگاه‌های مترو تهران با دسترسی مستقیم به اطلاعات ایستگاه و مسیریابی.",
    images: ["/socialprev.png"],
  },
};

export default function MapRoute() {
  return (
    <>
      <h1 className="sr-only">نقشه مترو تهران</h1>
      <p className="sr-only">
        نقشه آنلاین خطوط و ایستگاه‌های مترو تهران؛ ایستگاه را بررسی کن و مستقیم وارد مسیریابی شو.
      </p>
      <Suspense>
        <MapPage />
      </Suspense>
    </>
  );
}
