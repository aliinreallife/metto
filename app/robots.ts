import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      {
        userAgent: ["GPTBot", "ChatGPT-User", "Google-Extended", "Bytespider"],
        allow: "/",
      },
    ],
    sitemap: "https://metto.ir/sitemap.xml",
  };
}
