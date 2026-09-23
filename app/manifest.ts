import type { MetadataRoute } from "next";

// `*_localized` follows the Web App Manifest localization proposal and is
// not yet in Next's `MetadataRoute.Manifest` type — keep it via an
// intersection so typecheck passes while the fields are still serialized.
interface LocalizedManifest extends MetadataRoute.Manifest {
  name_localized?: Record<string, { value: string; lang: string; dir: string }>;
  short_name_localized?: Record<string, { value: string; lang: string; dir: string }>;
  description_localized?: Record<string, { value: string; lang: string; dir: string }>;
}

export default function manifest(): LocalizedManifest {
  return {
    id: "/",
    name: "metto",
    short_name: "metto",
    description: "metto, Tehran Metro map with smart route planning, schedules, and all Tehran Metro stations and lines.",
    name_localized: {
        fa: {
            value: "متو",
            lang: "fa",
            dir: "rtl"
        }
    },
    short_name_localized: {
        fa: {
            value: "متو",
            lang: "fa",
            dir: "rtl"
        }
    },
    description_localized: {
        fa: {
            value: "متو، نقشه مترو تهران با امکان مسیریابی هوشمند، مشاهده زمانبندی و تمام ایستگاه‌ها و خطوط متروی تهران.",
            lang: "fa",
            dir: "rtl"
        }
    },
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#cc0e2d",
    orientation: "any",
    categories: ["travel", "navigation", "maps"],
    // Lets the web UI detect the installed Android wrapper via
    // navigator.getInstalledRelatedApps() (see lib/twa.ts) so the native
    // "Turn on location" action only appears inside the TWA.
    // prefer_related_applications stays false: no install-prompt change.
    related_applications: [
      {
        platform: "play",
        url: "https://metto.ir/",
        id: "ir.metto.app",
      },
    ],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
