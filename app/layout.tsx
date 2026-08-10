import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import { FingerprintProvider } from "@fingerprint/react";
import { MetroProvider } from "./providers";
import { AppNav } from "./nav";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
});

const siteUrl = "https://metto.ir";

export const metadata: Metadata = {
  title: {
    default: "متو | نقشه و مسیریابی مترو تهران",
    template: "%s | متو",
  },
  description:
    "متو — نقشه مترو تهران با مسیریابی هوشمند، زمان‌بندی خطوط و لیست تمام ایستگاه‌ها. سریع‌ترین مسیر را بین ایستگاه‌های مترو پیدا کنید.",
  verification: {
    google: "yT7M8VQ3-f2WbNtL_hwI6hVnVSgTkp1xGp2NMg7QL-E",
  },
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
    languages: {
      en: "/?lang=en",
      fa: "/",
    },
  },
  keywords: [
    "نقشه مترو",
    "مترو تهران",
    "نقشه مترو تهران",
    "زمان‌بندی مترو",
    "زمان‌بندی مترو تهران",
    "مسیریابی مترو",
    "مسیریاب مترو",
    "ایستگاه مترو تهران",
    "خط مترو تهران",
    "مسیر مترو",
    "قیمت بلیت مترو",
    "ساعت مترو تهران",
    "metro tehran",
    "tehran metro map",
    "tehran subway",
    "متو",
    "metto",
  ],
  authors: [{ name: "aliinreallife" }],
  creator: "aliinreallife",
  publisher: "aliinreallife",
  applicationName: "متو — Metto",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "fa_IR",
    alternateLocale: "en_US",
    url: siteUrl,
    siteName: "متو — نقشه مترو تهران و مسیریابی",
    title: "متو | نقشه و مسیریابی مترو تهران",
    description:
      "متو — نقشه مترو تهران با مسیریابی هوشمند، زمان‌بندی خطوط و لیست تمام ایستگاه‌ها.",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "متو — نقشه و مسیریابی مترو تهران",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "متو | نقشه و مسیریابی مترو تهران",
    description:
      "متو — نقشه مترو تهران با مسیریابی هوشمند، زمان‌بندی خطوط و لیست تمام ایستگاه‌ها.",
    images: ["/icon-512.png"],
    creator: "@aliinreallife",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "متو | Metto",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#cc0e2d" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "متو",
  alternateName: ["Metto", "مترو تهران", "نقشه مترو تهران", "نقشه مترو"],
  url: siteUrl,
  description:
    "متو — نقشه مترو تهران با مسیریابی هوشمند، زمان‌بندی خطوط و لیست تمام ایستگاه‌ها.",
  applicationCategory: "TravelApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "IRR",
  },
  featureList: [
    "مسیریابی هوشمند مترو",
    "نقشه تعاملی مترو تهران",
    "زمان‌بندی مترو تهران",
    "لیست تمام ایستگاه‌های مترو",
    "پیدا کردن نزدیک‌ترین ایستگاه",
    "اطلاعات خطوط مترو",
  ],
  inLanguage: ["fa", "en"],
  about: {
    "@type": "Thing",
    name: "مترو تهران",
    sameAs: "https://en.wikipedia.org/wiki/Tehran_Metro",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} bg-background`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="flex h-dvh flex-col font-sans antialiased">
        <FingerprintProvider
          apiKey="PeMqnfaeFyuBBJjOvNQ5"
          region="us"
          endpoints={
            process.env.fp_endpoint
              ? [process.env.fp_endpoint]
              : undefined
          }
        >
          <MetroProvider>
            <AppNav />
            <div className="relative min-h-0 flex-1 flex flex-col pb-14 md:pb-0">{children}</div>
          </MetroProvider>
        </FingerprintProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
        {process.env.NODE_ENV === "production" && <SpeedInsights />}
      </body>
    </html>
  );
}
