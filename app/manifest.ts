import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tehran Metro — Route Planner & Map",
    short_name: "Tehran Metro",
    description: "Plan the best route across the Tehran subway and explore the full network map.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#cc0e2d",
    orientation: "any",
    categories: ["travel", "navigation", "maps"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
