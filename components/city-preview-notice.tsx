"use client";
import { useMetro } from "@/app/providers";
import { getCityPreview } from "@/lib/city-previews";
import { STRINGS } from "@/lib/i18n";
import type { CityId } from "@/lib/cities";

export function CityPreviewNotice({ city }: { city: CityId | "all" }) {
  const { lang } = useMetro();
  const preview = getCityPreview(city);
  if (!preview) return null;
  const t = STRINGS[lang];
  return <aside data-testid="city-preview-notice" className="shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-xs leading-5">
    <span className="me-2 font-semibold">{t.cityPreviewLabel}</span>
    <span className="text-muted-foreground">{preview.notice[lang]}</span>{" "}
    <a href={preview.sourceUrl} className="inline-flex min-h-8 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">{t.cityPreviewSource}</a>
  </aside>;
}
