import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "مترو تهران — نقشه مترو و مسیریاب",
    short_name: "مترو تهران",
    description:
      "نقشه مترو تهران با امکان مسیریابی هوشمند، مشاهده تمام ایستگاه‌ها و خطوط متروی تهران.",
    start_url: "/",
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
