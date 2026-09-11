import type { Metadata } from "next";
import { Suspense } from "react";
import { HomePage } from "./home-page";

export const metadata: Metadata = {
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
        alt: "متو - مسیریاب مترو تهران",
        type: "image/png",
      },
    ],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<SegmentLoading testId="route-loading" />}>
      <HomePage />
    </Suspense>
  );
}

/** Visible loading state so a suspended segment never looks like an empty app. */
function SegmentLoading({ testId }: { testId: string }) {
  return (
    <div
      data-testid={testId}
      role="status"
      aria-label="Loading"
      className="flex size-full items-center justify-center"
    >
      <div
        aria-hidden
        className="size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
      />
    </div>
  );
}
