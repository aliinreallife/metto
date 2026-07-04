"use client";

import { X, MapPin, Flag } from "lucide-react";
import { LINE_COLORS, type Station } from "@/lib/metro-data";
import { AMENITY_ICON_MAP } from "@/lib/amenity-icons";
import { AMENITY_LABELS, STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { geoUrl } from "@/lib/geo";

export function StationDetail({
  station,
  lang,
  onClose,
  onSetDest,
}: {
  station: Station;
  lang: Lang;
  onClose: () => void;
  onSetDest: () => void;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const activeAmenities = Object.entries(station.amenities).filter(
    ([, v]) => v,
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold leading-tight">
            {isFa ? station.fa : station.name}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isFa ? station.name : station.fa}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex gap-1.5">
            {station.lines.map((l) => (
              <span
                key={l}
                className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: LINE_COLORS[l] }}
              >
                {persianDigits(l, lang)}
              </span>
            ))}
          </div>
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {station.lines.length > 1 && (
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {t.interchange}
        </span>
      )}

      {activeAmenities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeAmenities.map(([key]) => {
            const Icon = AMENITY_ICON_MAP[key];
            return (
              <span
                key={key}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-foreground"
              >
                {Icon && <Icon className="size-3.5 shrink-0 text-primary" />}
                {AMENITY_LABELS[key]?.[lang] ?? key}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <a
          href={geoUrl(
            { lat: station.lat, lng: station.lng },
            isFa ? station.fa : station.name,
          )}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.directions}
          title={t.directions}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MapPin className="size-4" />
          {t.directions}
        </a>
        <button
          type="button"
          onClick={onSetDest}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Flag className="size-4" />
          {t.setDestination}
        </button>
      </div>
    </div>
  );
}
