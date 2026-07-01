"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Building2, ChevronDown, Loader2, MapPin, X } from "lucide-react"
import { STATION_MAP, searchStations } from "@/lib/route"
import { LINE_COLORS } from "@/lib/metro-data"
import { searchPlaces, type PlaceResult } from "@/lib/geocoding"
import { STRINGS, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Props = {
  value: string | null
  onChange: (id: string | null) => void
  onPlaceSelect?: (place: { lat: number; lng: number; name: string }) => void
  placeholder: string
  lang: Lang
  accentClass: string
}

export function StationCombobox({ value, onChange, onPlaceSelect, placeholder, lang, accentClass }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [places, setPlaces] = useState<PlaceResult[]>([])
  const [placesLoading, setPlacesLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const selected = value ? STATION_MAP.get(value) : null
  const results = useMemo(() => searchStations(query, 40), [query])

  // Debounced place search
  useEffect(() => {
    if (query.length < 3) {
      setPlaces([])
      setPlacesLoading(false)
      return
    }

    setPlacesLoading(true)
    const timer = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      searchPlaces(query, lang, 5).then((res) => {
        if (!controller.signal.aborted) {
          setPlaces(res)
          setPlacesLoading(false)
        }
      })
    }, 500)

    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [query, lang])

  // Clear places when dropdown closes
  useEffect(() => {
    if (!open) {
      setPlaces([])
      setPlacesLoading(false)
      setQuery("")
    }
  }, [open])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const isFa = lang === "fa"
  const t = STRINGS[lang]
  const hasStationResults = results.length > 0
  const hasPlaceResults = places.length > 0
  const hasAnyResults = hasStationResults || hasPlaceResults || placesLoading
  const showNoResults = query.length >= 2 && !hasAnyResults && !placesLoading

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={cn("size-2.5 shrink-0 rounded-full", accentClass)} aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="truncate font-medium">{isFa ? selected.fa : selected.name}</span>
              <span className="truncate text-xs text-muted-foreground">{isFa ? selected.name : selected.fa}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </span>
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              dir="auto"
              className="w-full rounded-md bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {/* Station results */}
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(s.id)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent",
                    value === s.id && "bg-accent",
                  )}
                >
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{isFa ? s.fa : s.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{isFa ? s.name : s.fa}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {s.lines.map((l) => (
                      <span
                        key={l}
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: LINE_COLORS[l] }}
                        aria-hidden
                      />
                    ))}
                  </span>
                </button>
              </li>
            ))}

            {/* Divider + place results */}
            {query.length >= 3 && (hasPlaceResults || placesLoading) && (
              <>
                {hasStationResults && (
                  <li className="mx-3 my-1 border-t border-border" />
                )}
                <li className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.places}
                </li>
                {placesLoading && places.length === 0 && (
                  <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t.searchingPlaces}
                  </li>
                )}
                {places.map((p, i) => (
                  <li key={`${p.lat}-${p.lng}-${i}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onPlaceSelect?.({ lat: p.lat, lng: p.lng, name: p.displayName })
                        setOpen(false)
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.displayName}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </>
            )}

            {/* No results */}
            {showNoResults && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t.noResults}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
