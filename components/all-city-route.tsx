"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMetro } from "@/app/providers";
import { ArrowUpDown } from "lucide-react";
import { CityStationPicker } from "./city-station-picker";
import { catalogStations } from "@/lib/city-catalog";
import { STRINGS } from "@/lib/i18n";

export function AllCityRoute() {
  const { lang, cityIds } = useMetro(); const params = useSearchParams(); const t = STRINGS[lang];
  const stations = useMemo(() => catalogStations(cityIds).sort((a, b) => a.names[lang].localeCompare(b.names[lang], lang)), [cityIds, lang]);
  const [from, setFrom] = useState(params.get("from") ?? ""); const [to, setTo] = useState(params.get("to") ?? "");
  const origin = stations.find(s => s.id === from), destination = stations.find(s => s.id === to);
  const sameCity = origin && destination && origin.cityId === destination.cityId;
  const routeParams = new URLSearchParams({ from: origin?.localId ?? "", to: destination?.localId ?? "", lang });
  for (const [key, endpoint, selected] of [["op", "from", from], ["dp", "to", to]]) { const pin = params.get(key); if (pin && params.get(endpoint) === selected) routeParams.set(key, pin); }
  const href = sameCity && origin.id !== destination.id ? `/${origin.cityId}/route?${routeParams}` : null;
  return <div className="no-scrollbar flex size-full flex-col overflow-y-auto overflow-x-hidden p-4 md:items-center md:p-8 lg:p-10" dir={lang === "fa" ? "rtl" : "ltr"}>
    <div className="flex w-full max-w-xl flex-col gap-4 md:max-w-2xl md:gap-5">
      <h1 className="sr-only">{t.findRoute} · {t.allCities}</h1>
      <div className="flex flex-col gap-2.5">
        <label htmlFor="all-from" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">{t.from}</label>
        <CityStationPicker id="all-from" stations={stations} value={from} onChange={setFrom} lang={lang} placeholder={t.searchStations} accentClass="bg-primary" showCity />
        <label htmlFor="all-to" className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">{t.to}</label>
        <div className="flex gap-2">
          <CityStationPicker id="all-to" stations={stations} value={to} onChange={setTo} lang={lang} placeholder={t.searchStations} accentClass="bg-foreground" showCity />
          <button aria-label={t.swap} className="flex min-h-[44px] w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary" onClick={() => { setFrom(to); setTo(from); }}><ArrowUpDown aria-hidden="true" className="size-4" /></button>
        </div>
      </div>
      {origin && destination && !sameCity && <p role="alert" className="text-sm">{t.citySameCityOnly}</p>}
      {origin && destination && origin.id === destination.id && <p role="alert" className="text-sm">{t.sameStation}</p>}
      {href && <Link href={href} className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary">{t.findRoute}</Link>}
      {!origin || !destination ? <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t.pickBoth}</p> : null}
    </div>
  </div>;
}
