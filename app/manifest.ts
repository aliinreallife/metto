import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "متو — نقشه مترو تهران، مسیریابی و زمانبندی",
    short_name: "متو",
    description:
      "متو | نقشه مترو تهران با امکان مسیریابی هوشمند، مشاهده زمانبندی و تمام ایستگاه‌ها و خطوط متروی تهران.",
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
