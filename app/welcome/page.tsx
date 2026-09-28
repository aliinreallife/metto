import type { Metadata } from "next";
import { WelcomePage } from "./welcome-page";

export const metadata: Metadata = {
  title: "مسیریاب مترو، ساده و سریع",
  description: "متو؛ مسیریاب رایگان مترو با زمان رسیدن، نقشه واقعی و اطلاعات ایستگاه‌ها.",
  alternates: {
    canonical: "https://metto.ir/welcome",
    languages: { fa: "https://metto.ir/welcome", en: "https://metto.ir/welcome?lang=en" },
  },
  openGraph: {
    title: "متو | مسیریاب مترو، ساده و سریع",
    description: "بهترین مسیر، زمان رسیدن و قطار بعدی را ببین.",
    url: "https://metto.ir/welcome",
    images: ["/socialprev.png"],
  },
};

export default function Page() {
  return <WelcomePage />;
}
