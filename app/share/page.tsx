import type { Metadata } from "next";
import {
  buildSharePresentation,
  searchRecordToParams,
  SHARE_GENERIC_DESC,
  SHARE_GENERIC_TITLE,
  SHARE_SITE_URL,
} from "@/lib/route-share";
import { ShareRedirect } from "./redirect";

// Share-preview endpoint (Level-1, FA-only v1).
//
// A share URL describes a specific journey state and is therefore:
// - `noindex, follow` (never a combinatorial SEO surface),
// - excluded from the sitemap (nothing to add — it simply isn't listed),
// - canonicalized to the stable planner root,
// - fully crawlable for OG unfurl (social scrapers ignore robots meta).
//
// Humans never stay here: ShareRedirect hands them to /route with the
// identical query. /route itself stays static/offline-safe — the dynamism
// lives only on this route.

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const p = buildSharePresentation(
    searchRecordToParams(await searchParams),
    Date.now(),
  );
  const ogUrl = new URL(p.sharePath, SHARE_SITE_URL).href;
  const image = p.valid
    ? {
        url: p.imagePath,
        width: 1200,
        height: 630,
        // Generic alt: the card renders the "به" form while the title uses
        // the arrow form, so alt must not quote either arrangement.
        alt: "مسیر مترو در متو",
        type: "image/png",
      }
    : {
        url: p.imagePath,
        width: 1731,
        height: 909,
        alt: "متو - مسیریاب مترو",
        type: "image/png",
      };
  // openGraph/twitter replace (not merge with) the root layout objects, so
  // every inherited field that still applies is restated here.
  return {
    title: p.valid ? p.title : SHARE_GENERIC_TITLE,
    description: p.valid ? p.description : SHARE_GENERIC_DESC,
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: p.canonical,
    },
    openGraph: {
      title: p.valid ? p.title : SHARE_GENERIC_TITLE,
      description: p.valid ? p.description : SHARE_GENERIC_DESC,
      url: ogUrl,
      siteName: "متو",
      locale: p.locale,
      alternateLocale: "en_US",
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: p.valid ? p.title : SHARE_GENERIC_TITLE,
      description: p.valid ? p.description : SHARE_GENERIC_DESC,
      images: [p.imagePath],
    },
  };
}

export default function SharePage() {
  return <ShareRedirect />;
}
