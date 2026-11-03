"use client";
import { useMetro } from "@/app/providers";
import { getCityPreview } from "@/lib/city-previews";
import { STRINGS } from "@/lib/i18n";
import { getCityMeta, type CityId } from "@/lib/cities";
import { cityDataCredit } from "@/lib/data-credit";

export function CityPreviewNotice({ city }: { city: CityId | "all" }) {
  const { lang } = useMetro();
  // Public Tabriz is a verified mapped *network*, not a verified operating
  // timetable. Keep the source uncertainty visible after the preview banner
  // disappears; never imply that the last-train time is definitive.
  if (city === "tabriz" && getCityMeta("tabriz")?.release === "public") {
    const source = cityDataCredit("tabriz");
    return <aside data-testid="tabriz-timetable-notice"
      className="shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-xs leading-5">
      <span className="me-2 font-semibold">
        {lang === "fa" ? "زمان‌بندی غیررسمی تبریز" : "Unofficial Tabriz timetable"}
      </span>
      <span className="text-muted-foreground">
        {lang === "fa"
          ? "زمان آخرین قطارها و برنامهٔ پنجشنبه و تعطیلات بین منابع متفاوت است؛ قبل از سفر اطلاعیهٔ ایستگاه را بررسی کنید."
          : "Sources disagree about last trains and Thursday/holiday schedules. Check station notices before travel."}
      </span>{" "}
      <a href={source.url} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-8 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
        {lang === "fa" ? "منبع: TimeMetro" : "Source: TimeMetro"}
      </a>
    </aside>;
  }
  const preview = getCityPreview(city);
  if (!preview) return null;
  const t = STRINGS[lang];
  return <aside data-testid="city-preview-notice" className="shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-xs leading-5">
    <span className="me-2 font-semibold">{t.cityPreviewLabel}</span>
    <span className="text-muted-foreground">{preview.notice[lang]}</span>{" "}
    <a href={preview.sourceUrl} className="inline-flex min-h-8 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">{t.cityPreviewSource}</a>
  </aside>;
}
