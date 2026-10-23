"use client";
import { usePathname, useRouter } from "next/navigation";
import { useMetro } from "@/app/providers";
import { CITIES, cityFromPath, cityHref, viewFromPath } from "@/lib/cities";
import { STRINGS } from "@/lib/i18n";
import { useConnectivity } from "@/lib/offline/use-connectivity";

export function CitySwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, cityIds } = useMetro();
  const pathname = usePathname(); const router = useRouter();
  const { state: connectivity } = useConnectivity();
  const t = STRINGS[lang];
  return <label className="flex min-w-0 items-center gap-2 text-sm">
    <span className="sr-only">{t.chooseCity}</span>
    <select aria-label={t.chooseCity} value={cityFromPath(pathname)}
      className={compact
        ? "h-6 max-w-36 cursor-pointer rounded border-0 bg-transparent pe-1 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary md:text-sm"
        : "min-h-[44px] max-w-36 rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"}
      onChange={e => {
        const next = e.target.value;
        if (next === "tehran" || next === "mashhad" || next === "all") {
          try { if (next !== "all") localStorage.setItem("city.last", next); } catch { /* storage optional */ }
          // Carry language only: endpoints, places and timetable options belong to their city.
          const href = `${cityHref(next, viewFromPath(pathname))}?lang=${lang}`;
          // Offline city tabs need a document request so the service worker can serve HTML.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          if (connectivity !== "online" || navigator.onLine === false) window.location.assign(href);
          else router.push(href);
        }
      }}>
      <option value="all">{t.allCities}</option>
      {CITIES.filter(c => cityIds.includes(c.slug)).map(c => <option key={c.slug} value={c.slug}>{c.name[lang]}</option>)}
    </select>
  </label>;
}
