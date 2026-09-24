import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import { MetroProvider } from "./providers";
import { SerwistProvider } from "./serwist";
import { AppNav } from "./nav";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  weight: "variable",
});

const siteUrl = "https://metto.ir";

export const metadata: Metadata = {
  title: {
    default: "متو | مسیریاب مترو، زمان قطار بعدی و تخمین رسیدن",
    template: "%s | متو",
  },
  description:
    "با متو مسیر مترو را پیدا کن، زمان رسیدن و قطار بعدی را ببین، مسیرت را به اشتراک بگذار و نزدیک‌ترین راه تا ایستگاه شروع را پیدا کن.",
  verification: {
    google: "yT7M8VQ3-f2WbNtL_hwI6hVnVSgTkp1xGp2NMg7QL-E",
  },
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: siteUrl,
    languages: {
      en: "/?lang=en",
      fa: "/",
    },
  },
  keywords: [
    "نقشه مترو",
    "نقشه مترو ایران",
    "زمان‌بندی مترو",
    "مسیریابی مترو",
    "مسیریاب مترو",
    "مسیر مترو",
    "قیمت بلیت مترو",
    "متو",
    "metto",
    "iran metro map",
    "iran subway",
  ],
  authors: [{ name: "aliinreallife" }],
  creator: "aliinreallife",
  publisher: "aliinreallife",
  applicationName: "متو — metto",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "fa_IR",
    alternateLocale: "en_US",
    url: siteUrl,
    siteName: "متو",
    title: "متو | مسیریاب مترو، زمان قطار بعدی و تخمین رسیدن",
    description:
      "با متو مسیر مترو را پیدا کن، زمان رسیدن و قطار بعدی را ببین، مسیرت را به اشتراک بگذار و نزدیک‌ترین راه تا ایستگاه شروع را پیدا کن.",
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
    title: "متو | مسیریاب مترو، زمان قطار بعدی و تخمین رسیدن",
    description:
      "با متو مسیر مترو را پیدا کن، زمان رسیدن و قطار بعدی را ببین، مسیرت را به اشتراک بگذار و نزدیک‌ترین راه تا ایستگاه شروع را پیدا کن.",
    images: ["/socialprev.png"],
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
    title: "متو | metto",
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
  alternateName: ["metto", "نقشه مترو", "مسیریاب مترو"],
  url: siteUrl,
  description:
    "متو — نقشه مترو با مسیریابی هوشمند، زمان‌بندی خطوط و لیست تمام ایستگاه‌ها.",
  applicationCategory: "TravelApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "IRR",
  },
  featureList: [
    "مسیریابی هوشمند مترو",
    "نقشه تعاملی مترو",
    "زمان‌بندی مترو",
    "لیست تمام ایستگاه‌های مترو",
    "پیدا کردن نزدیک‌ترین ایستگاه",
    "اطلاعات خطوط مترو",
  ],
  inLanguage: ["fa", "en"],
  about: {
    "@type": "Thing",
    name: "مترو",
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
        <SerwistProvider
          swUrl="/sw.js"
          options={{ scope: "/", updateViaCache: "none" }}
          // Never auto-reload on reconnect (tunnels/elevators flicker) and
          // never patch history for cache-on-navigation: our Serwist worker
          // ignores CACHE_URLS and precache already covers navigations.
          reloadOnOnline={false}
          cacheOnNavigation={false}
          disable={process.env.NODE_ENV === "development"}
        >
        <MetroProvider>
          <AppNav />
          <main className="relative min-h-0 flex-1 flex flex-col overflow-hidden pb-[60px] pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
        </MetroProvider>
        </SerwistProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
        {process.env.NODE_ENV === "production" && <SpeedInsights />}
      </body>
    </html>
  );
}
