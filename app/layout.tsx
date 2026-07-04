import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Vazirmatn } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  weight: ["400", "700", "800"],
});

const siteUrl = "https://metro.tehran-app.ir";

export const metadata: Metadata = {
  title: {
    default: "مترو تهران — نقشه مترو و مسیریاب",
    template: "%s | مترو تهران",
  },
  description:
    "نقشه مترو تهران با امکان مسیریابی هوشمند، مشاهده تمام ایستگاه‌ها و خطوط متروی تهران. سریع‌ترین مسیر را بین ایستگاه‌ها پیدا کنید.",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
    languages: {
      en: "/?lang=en",
      fa: "/",
    },
  },
  keywords: [
    "مترو تهران",
    "نقشه مترو",
    "نقشه مترو تهران",
    "مسیریاب مترو",
    "ایستگاه مترو تهران",
    "خط مترو تهران",
    "metro tehran",
    "tehran metro map",
    "tehran subway",
    "مسیر مترو",
    "قیمت بلیت مترو",
    "ساعت مترو تهران",
  ],
  authors: [{ name: "aliinreallife" }],
  creator: "aliinreallife",
  publisher: "aliinreallife",
  applicationName: "مترو تهران",
  generator: "v0.app",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "fa_IR",
    alternateLocale: "en_US",
    url: siteUrl,
    siteName: "مترو تهران — نقشه مترو و مسیریاب",
    title: "مترو تهران — نقشه مترو و مسیریاب",
    description:
      "نقشه مترو تهران با امکان مسیریابی هوشمند، مشاهده تمام ایستگاه‌ها و خطوط متروی تهران. سریع‌ترین مسیر را بین ایستگاه‌ها پیدا کنید.",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "نقشه مترو تهران — مسیریاب هوشمند",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "مترو تهران — نقشه مترو و مسیریاب",
    description:
      "نقشه مترو تهران با امکان مسیریابی هوشمند، مشاهده تمام ایستگاه‌ها و خطوط متروی تهران.",
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
    title: "مترو تهران",
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
  name: "مترو تهران",
  alternateName: ["Tehran Metro", "نقشه مترو تهران", "نقشه مترو"],
  url: siteUrl,
  description:
    "نقشه مترو تهران با امکان مسیریابی هوشمند، مشاهده تمام ایستگاه‌ها و خطوط متروی تهران.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${vazirmatn.variable} bg-background`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
        {process.env.NODE_ENV === "production" && <SpeedInsights />}
      </body>
    </html>
  );
}
