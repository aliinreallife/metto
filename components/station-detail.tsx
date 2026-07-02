"use client";

import { X, Navigation, Flag, MapPin } from "lucide-react";
import { LINE_COLORS, type Station } from "@/lib/metro-data";
import { AMENITY_ICON_MAP } from "@/lib/amenity-icons";
import { AMENITY_LABELS, STRINGS, persianDigits, type Lang } from "@/lib/i18n";
import { geoUrl } from "@/lib/geo";

export function StationDetail({
  station,
  lang,
  userLoc,
  onClose,
  onSetOrigin,
  onSetDest,
}: {
  station: Station;
  lang: Lang;
  userLoc?: { lat: number; lng: number } | null;
  onClose: () => void;
  onSetOrigin: () => void;
  onSetDest: () => void;
}) {
  const t = STRINGS[lang];
  const isFa = lang === "fa";
  const activeAmenities = Object.entries(station.amenities).filter(
    ([, v]) => v,
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold">
            {isFa ? station.fa : station.name}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {isFa ? station.name : station.fa}
          </p>
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

      <div className="flex flex-wrap items-center gap-1.5">
        {station.lines.map((l) => (
          <span
            key={l}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold text-white"
            style={{ backgroundColor: LINE_COLORS[l] }}
          >
            {t.line} {persianDigits(l, lang)}
          </span>
        ))}
        {station.lines.length > 1 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t.interchange}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <a
          href={geoUrl(
            { lat: station.lat, lng: station.lng },
            isFa ? station.fa : station.name,
          )}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.navigate}
          title={t.navigate}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MapPin className="size-4" />
          {t.navigate}
        </a>
        <button
          type="button"
          onClick={onSetOrigin}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Navigation className="size-4" />
          {t.from}
        </button>
        <button
          type="button"
          onClick={onSetDest}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
        >
          <Flag className="size-4" />
          {t.to}
        </button>
      </div>

      {activeAmenities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeAmenities.map(([key]) => {
            const Icon = AMENITY_ICON_MAP[key];
            return (
              <span
                key={key}
                className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-1 text-xs text-foreground"
              >
                {Icon && <Icon className="size-3.5 shrink-0 text-primary" />}
                {AMENITY_LABELS[key]?.[lang] ?? key}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
