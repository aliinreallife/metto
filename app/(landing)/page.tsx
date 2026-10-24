import type { Metadata } from "next";
import { WelcomePage } from "./welcome-page";

export const metadata: Metadata = {
  title: "نقشه و مسیریاب مترو شهرهای ایران",
  description:
    "شهرت را انتخاب کن، نقشه و ایستگاه‌ها را ببین و مسیرت را پیدا کن. رایگان و بدون تبلیغ. زمان حرکت قطارها برای تهران در دسترس است.",
  alternates: {
    canonical: "https://metto.ir",
  },
  openGraph: {
    title: "نقشه و مسیریاب مترو شهرهای ایران | متو",
    description:
      "نقشه، ایستگاه‌ها و مسیرهای مترو را برای هر شهر جداگانه ببین.",
    url: "https://metto.ir",
    images: ["/socialprev.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "نقشه و مسیریاب مترو شهرهای ایران | متو",
    description:
      "نقشه، ایستگاه‌ها و مسیرهای مترو را برای هر شهر جداگانه ببین.",
    images: ["/socialprev.png"],
  },
};

export default function Page() {
  return <WelcomePage />;
}
