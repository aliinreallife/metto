import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://metro.tehran-app.ir";

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          fa: baseUrl,
          en: `${baseUrl}?lang=en`,
        },
      },
    },
  ];
}
