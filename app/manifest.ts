import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Metto",
    short_name: "Metto",
    description: "Metto, Tehran Metro map with smart route planning, schedules, and all Tehran Metro stations and lines.",
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
