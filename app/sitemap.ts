import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://metto.ir";

  return [
    {
      url: baseUrl,
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          fa: baseUrl,
          en: `${baseUrl}?lang=en`,
        },
      },
    },
    {
      url: `${baseUrl}/stations`,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: {
        languages: {
          fa: `${baseUrl}/stations`,
          en: `${baseUrl}/stations?lang=en`,
        },
      },
    },
    {
      url: `${baseUrl}/nearby`,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: {
        languages: {
          fa: `${baseUrl}/nearby`,
          en: `${baseUrl}/nearby?lang=en`,
        },
      },
    },
    {
      url: `${baseUrl}/map`,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: {
        languages: {
          fa: `${baseUrl}/map`,
          en: `${baseUrl}/map?lang=en`,
        },
      },
    },
    {
      url: `${baseUrl}/route`,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: {
        languages: {
          fa: `${baseUrl}/route`,
          en: `${baseUrl}/route?lang=en`,
        },
      },
    },
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: "monthly",
      priority: 0.3,
      alternates: {
        languages: {
          fa: `${baseUrl}/privacy`,
          en: `${baseUrl}/privacy?lang=en`,
        },
      },
    },
  ];
}
