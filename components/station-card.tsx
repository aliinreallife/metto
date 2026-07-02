"use client";

import { MapPin, Navigation, Flag, ChevronDown } from "lucide-react";
import { LINE_COLORS, type Station } from "@/lib/metro-data";
import { AMENITY_ICON_MAP } from "@/lib/amenity-icons";
import { AMENITY_LABELS, STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { geoUrl } from "@/lib/geo";
import { formatDistance } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { useState } from "react";

type Props = {
  station: Station;
  lang: Lang;
  distance?: number;
  onSetOrigin: () => void;
  onSetDest: () => void;
  showAmenities?: boolean;
};

export function StationCard({
  station,
  lang,
  distance,
  onSetOrigin,
  onSetDest,
  showAmenities = true,
}: Props) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);

  const activeAmenities = Object.entries(station.amenities).filter(
    ([, v]) => v,
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold">
              {isFa ? station.fa : station.name}
            </h3>
            {distance !== undefined && (
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                · {formatDistance(distance, lang)}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {isFa ? station.name : station.fa}
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          {station.lines.map((l) => (
            <span
              key={l}
              className="flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: LINE_COLORS[l] }}
            >
              {persianDigits(l, lang)}
            </span>
          ))}
        </div>
      </div>

      {station.lines.length > 1 && (
        <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {t.interchange}
        </span>
      )}

      {showAmenities && activeAmenities.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAmenitiesOpen(!amenitiesOpen)}
            className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                amenitiesOpen && "rotate-180",
              )}
            />
            {isFa ? "امکانات" : "Amenities"}
            <span className="h-px flex-1 bg-border" />
          </button>
          {amenitiesOpen && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeAmenities.map(([key]) => {
                const Icon = AMENITY_ICON_MAP[key];
                return (
                  <span
                    key={key}
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
                  >
                    {Icon && (
                      <Icon className="size-3.5 shrink-0 text-primary" />
                    )}
                    {AMENITY_LABELS[key]?.[lang] ?? key}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <a
          href={geoUrl(
            { lat: station.lat, lng: station.lng },
            isFa ? station.fa : station.name,
          )}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.navigate}
          title={t.navigate}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MapPin className="size-4" />
          {t.navigate}
        </a>
        <button
          type="button"
          onClick={onSetOrigin}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Navigation className="size-4" />
          {t.from}
        </button>
        <button
          type="button"
          onClick={onSetDest}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Flag className="size-4" />
          {t.to}
        </button>
      </div>
    </div>
  );
}
