import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://metto.ir";

  return [
    ...["/tehran", "/tehran/route", "/tehran/map", "/tehran/stations", "/tehran/nearby", "/cities", "/cities/map", "/cities/route", "/cities/nearby"].map(path => ({ url: `${baseUrl}${path}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    {
      url: baseUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/stations`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/nearby`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/map`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/route`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
