"use client"

import { useMemo, useState } from "react"
import { LocateFixed, Loader2, MapPin, Car, Navigation, Flag, Train } from "lucide-react"
import { StationCombobox } from "@/components/station-combobox"
import { LINE_COLORS } from "@/lib/metro-data"
import {
  nearestStations,
  formatDistance,
  directionsUrl,
  snappUrl,
  tapsiUrl,
  type AmenityKey,
} from "@/lib/geo"
import { STATION_MAP } from "@/lib/route"
import { AMENITY_LABELS, STRINGS, persianDigits, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Props = {
  lang: Lang
  onSetOrigin: (id: string) => void
  onSetDest: (id: string) => void
}

type LocState =
  | { kind: "none" }
  | { kind: "locating" }
  | { kind: "gps"; lat: number; lng: number }
  | { kind: "station"; lat: number; lng: number; stationId: string }
  | { kind: "error"; message: string }

const AMENITY_KEYS = Object.keys(AMENITY_LABELS) as AmenityKey[]

export function NearbyTab({ lang, onSetOrigin, onSetDest }: Props) {
  const t = STRINGS[lang]
  const isFa = lang === "fa"
  const [loc, setLoc] = useState<LocState>({ kind: "none" })
  const [amenity, setAmenity] = useState<AmenityKey | null>(null)

  const coords = loc.kind === "gps" || loc.kind === "station" ? { lat: loc.lat, lng: loc.lng } : null

  const results = useMemo(() => {
    if (!coords) return []
    return nearestStations(coords.lat, coords.lng, { amenity, limit: 15 })
  }, [coords, amenity])

  function useGps() {
    if (!("geolocation" in navigator)) {
      setLoc({ kind: "error", message: t.gpsUnavailable })
      return
    }
    setLoc({ kind: "locating" })
    navigator.geolocation.getCurrentPosition(
      (pos) => setLoc({ kind: "gps", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setLoc({ kind: "error", message: err.code === err.PERMISSION_DENIED ? t.gpsDenied : t.gpsUnavailable }),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function pickStation(id: string | null) {
    if (!id) {
      setLoc({ kind: "none" })
      return
    }
    const s = STATION_MAP.get(id)
    if (s) setLoc({ kind: "station", lat: s.lat, lng: s.lng, stationId: s.id })
  }

  const locationLabel =
    loc.kind === "gps"
      ? t.useMyLocation
      : loc.kind === "station"
        ? (() => {
            const s = STATION_MAP.get(loc.stationId)
            return s ? (isFa ? s.fa : s.name) : ""
          })()
        : ""

  return (
    <div className="flex size-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        {/* Location setter */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <LocateFixed className="size-4 text-primary" />
            <h2 className="text-sm font-bold">{t.yourLocation}</h2>
            {coords && (
              <span className="ms-auto truncate text-xs text-muted-foreground">{locationLabel}</span>
            )}
          </div>

          <button
            type="button"
            onClick={useGps}
            disabled={loc.kind === "locating"}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loc.kind === "locating" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.locating}
              </>
            ) : (
              <>
                <LocateFixed className="size-4" />
                {t.useMyLocation}
              </>
            )}
          </button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t.orPickStation}
            <span className="h-px flex-1 bg-border" />
          </div>

          <StationCombobox
            value={loc.kind === "station" ? loc.stationId : null}
            onChange={pickStation}
            placeholder={t.searchStations}
            lang={lang}
            accentClass="bg-primary"
          />

          {loc.kind === "error" && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{loc.message}</p>
          )}
        </section>

        {!coords ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            {t.setLocation}
          </p>
        ) : (
          <>
            {/* Amenity filter */}
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.findAmenity}</p>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={amenity === null} onClick={() => setAmenity(null)}>
                  <Train className="size-3.5" />
                  {t.nearestStations}
                </FilterChip>
                {AMENITY_KEYS.map((key) => (
                  <FilterChip key={key} active={amenity === key} onClick={() => setAmenity(key)}>
                    {AMENITY_LABELS[key][lang]}
                  </FilterChip>
                ))}
              </div>
            </section>

            {/* Results */}
            <ul className="flex flex-col gap-2">
              {results.length === 0 && (
                <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  {t.noResults}
                </li>
              )}
              {results.map(({ station, km }, i) => (
                <li key={station.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {persianDigits(i + 1, lang)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{isFa ? station.fa : station.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{isFa ? station.name : station.fa}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {station.lines.map((l) => (
                          <span
                            key={l}
                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                            style={{ backgroundColor: LINE_COLORS[l] }}
                          >
                            {t.line} {persianDigits(l, lang)}
                          </span>
                        ))}
                        <span className="text-xs font-medium text-foreground">
                          {formatDistance(km, lang)} {t.away}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <a
                      href={directionsUrl({ lat: station.lat, lng: station.lng }, coords)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      <MapPin className="size-3.5 text-primary" />
                      {t.navigate}
                    </a>
                    <a
                      href={snappUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      <Car className="size-3.5 text-primary" />
                      {t.snapp}
                    </a>
                    <a
                      href={tapsiUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      <Car className="size-3.5 text-primary" />
                      {t.tapsi}
                    </a>
                    <span className="ms-auto flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSetOrigin(station.id)}
                        aria-label={t.from}
                        className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        <Navigation className="size-3.5" />
                        {t.from}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetDest(station.id)}
                        aria-label={t.to}
                        className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        <Flag className="size-3.5" />
                        {t.to}
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  )
}
