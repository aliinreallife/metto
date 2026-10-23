"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMetro } from "@/app/providers";
import { CITIES } from "@/lib/cities";
import { catalogStations } from "@/lib/city-catalog";
import { STRINGS } from "@/lib/i18n";

export function AllCityRoute() {
  const { lang, cityIds } = useMetro(); const t = STRINGS[lang];
  const stations = useMemo(() => catalogStations(cityIds).sort((a, b) => a.names[lang].localeCompare(b.names[lang], lang)), [cityIds, lang]);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const origin = stations.find(s => s.id === from), destination = stations.find(s => s.id === to);
  const sameCity = origin && destination && origin.cityId === destination.cityId;
  const href = sameCity && origin.id !== destination.id ? `/${origin.cityId}/route?${new URLSearchParams({ from: origin.localId, to: destination.localId, lang })}` : null;
  const control = "min-h-[44px] rounded-lg border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-primary";
  return <div className="min-h-0 flex-1 overflow-y-auto p-4" dir={lang === "fa" ? "rtl" : "ltr"}>
    <div className="mx-auto max-w-xl rounded-xl border p-5">
      <h1 className="text-xl font-bold">{t.findRoute}</h1><p className="mt-2 text-sm">{t.allCities}</p>
      <div className="mt-5 grid gap-4">
        {(["from", "to"] as const).map(role => <div key={role} className="grid gap-2">
          <label htmlFor={`all-${role}`}>{t[role]}</label>
          <select id={`all-${role}`} value={role === "from" ? from : to} onChange={e => (role === "from" ? setFrom : setTo)(e.target.value)} className={control}>
            <option value="">{t[role]}</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.names[lang]} · {CITIES.find(c => c.slug === s.cityId)!.name[lang]}</option>)}
          </select>
        </div>)}
        <button className={control} onClick={() => { setFrom(to); setTo(from); }}>{t.swap}</button>
      </div>
      {origin && destination && !sameCity && <p role="alert" className="mt-4">{t.citySameCityOnly}</p>}
      {origin && destination && origin.id === destination.id && <p role="alert" className="mt-4">{t.sameStation}</p>}
      {href && <Link href={href} className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary">{t.findRoute}</Link>}
      {!origin || !destination ? <p className="mt-4 text-sm">{t.pickBoth}</p> : null}
    </div>
  </div>;
}
