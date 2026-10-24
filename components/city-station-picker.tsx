"use client";

import { useMemo } from "react";
import { StationCombobox } from "./station-combobox";
import { CITY_LINES, type CityStation } from "@/lib/city-catalog";
import { CITIES } from "@/lib/cities";
import type { Lang } from "@/lib/i18n";

export function CityStationPicker({ id, stations, value, onChange, placeholder, lang, accentClass, showCity = false }: {
  id: string; stations: CityStation[]; value: string; onChange: (id: string) => void;
  placeholder: string; lang: Lang; accentClass: string; showCity?: boolean;
}) {
  const catalog = useMemo(() => stations.map(s => ({
    id: s.id, name: s.names,
    lineColors: s.lineIds.map(id => CITY_LINES.find(l => l.id === id)?.color ?? "#555"),
    cityName: showCity ? CITIES.find(c => c.slug === s.cityId)!.name : undefined,
  })), [stations, showCity]);
  return <StationCombobox id={id} value={value || null} onChange={id => onChange(id ?? "")}
    catalog={catalog} placeholder={placeholder} lang={lang} accentClass={accentClass} />;
}
