import type { Metadata } from "next";
import { WelcomePage } from "./welcome-page";

export const metadata: Metadata = {
  title: "مترویابی و مسیریاب مترو تهران",
  description:
    "مبدأ و مقصدت را بزن؛ بهترین مسیر مترو تهران، زمان رسیدن، تعویض خط و قطار بعدی را ببین. رایگان و بدون تبلیغ.",
  alternates: {
    canonical: "https://metto.ir",
    languages: { fa: "https://metto.ir", en: "https://metto.ir?lang=en" },
  },
  openGraph: {
    title: "مترویابی و مسیریاب مترو تهران | متو",
    description:
      "بهترین مسیر مترو تهران، زمان رسیدن، تعویض خط و قطار بعدی را ببین.",
    url: "https://metto.ir",
    images: ["/socialprev.png"],
  },
};

export default function Page() {
  return <WelcomePage />;
}
