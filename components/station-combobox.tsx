"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Building2, ChevronDown, Loader2, MapPin } from "lucide-react"
import { STATION_MAP, searchStations } from "@/lib/route"
import { LINE_COLORS } from "@/lib/metro/lines"
import { getStationLines } from "@/lib/metro/selectors"
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
  id?: string
}

export function StationCombobox({ value, onChange, onPlaceSelect, placeholder, lang, accentClass, id }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [places, setPlaces] = useState<PlaceResult[]>([])
  const [placesLoading, setPlacesLoading] = useState(false)
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const rawId = useId()
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, "")
  const triggerId = id ?? `station-trigger-${safeId}`
  const inputId = `${triggerId}-input`
  const listboxId = `${triggerId}-listbox`
  const statusId = `${triggerId}-status`

  const selected = value ? STATION_MAP.get(value) : null
  const results = useMemo(() => searchStations(query, 40), [query])

  useEffect(() => {
    const onOnline = () => setIsOffline(false)
    const onOffline = () => {
      setIsOffline(true)
      setPlaces([])
      setPlacesLoading(false)
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  // Debounced place search (online-only; station search stays local/offline).
  useEffect(() => {
    if (query.length < 3 || isOffline) {
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
  }, [query, lang, isOffline])

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

  function closeAndRefocusTrigger() {
    setOpen(false)
    // Focus restore so keyboard users don't lose their place after Escape.
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function handleDropdownKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation()
      closeAndRefocusTrigger()
    }
  }

  const isFa = lang === "fa"
  const t = STRINGS[lang]
  const hasStationResults = results.length > 0
  const hasPlaceResults = places.length > 0
  const hasAnyResults = hasStationResults || hasPlaceResults || placesLoading
  const showNoResults = query.length >= 2 && !hasAnyResults && !placesLoading

  const statusMessage = placesLoading
    ? t.searchingPlaces
    : showNoResults
      ? t.noResults
      : open && query.length > 0
        ? isFa
          ? `${results.length} ایستگاه`
          : `${results.length} stations`
        : ""

  return (
    <div ref={rootRef} className="relative">
      {/* Plain wrapper around the trigger so the dropdown can anchor to it.
          No clear (X) button by design — selection changes by picking
          another station. Padding lives on the trigger itself so the
          entire visible selector (dot + label + chevron) opens the dropdown. */}
      <div className="flex w-full items-center gap-2 rounded-lg border border-input bg-background text-sm transition-colors md:text-base">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.stopPropagation()
              closeAndRefocusTrigger()
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-4 md:py-3"
        >
          <span className={cn("size-2.5 shrink-0 rounded-full", accentClass)} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {selected ? (
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{isFa ? selected.name.fa : selected.name.en}</span>
                <span className="truncate text-xs text-muted-foreground">{isFa ? selected.name.en : selected.name.fa}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
      {/* Polite live region: announces result counts / loading / empty states. */}
      <p role="status" aria-live="polite" id={statusId} className="sr-only">
        {statusMessage}
      </p>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg" onKeyDown={handleDropdownKeyDown}>
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              id={inputId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation()
                  closeAndRefocusTrigger()
                }
              }}
              placeholder={placeholder}
              aria-label={placeholder}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              dir="auto"
              className="ios-no-zoom-input w-full rounded-md bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:px-4 md:py-2.5 md:text-base"
            />
          </div>
          <ul id={listboxId} role="listbox" aria-label={placeholder} className="max-h-64 overflow-y-auto py-1">
            {query.length === 0 && onPlaceSelect && (
              <li role="presentation" className="px-3 py-2 text-center text-xs text-muted-foreground md:px-4 md:py-2.5 md:text-sm">
                {STRINGS[lang].searchHintBefore}{" "}
                <button
                  type="button"
                  onClick={() => {
                    const example = STRINGS[lang].searchHintExample
                    setQuery(example)
                    if (isOffline) return
                    searchPlaces(example, lang, 1).then((res) => {
                      if (res.length > 0) {
                        onPlaceSelect({ lat: res[0].lat, lng: res[0].lng, name: res[0].displayName })
                        setOpen(false)
                      }
                    })
                  }}
                  className="cursor-pointer font-bold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {STRINGS[lang].searchHintExample}
                </button>
                {STRINGS[lang].searchHintAfter ? ` ${STRINGS[lang].searchHintAfter}` : ""}
              </li>
            )}
            {/* Station results */}
            {results.map((s) => (
              <li key={s.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === s.id}
                  onClick={() => {
                    onChange(s.id)
                    setOpen(false)
                    triggerRef.current?.focus()
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent focus:outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    value === s.id && "bg-accent",
                  )}
                >
                  <span className="flex shrink-0 gap-1" aria-hidden="true">
                    {getStationLines(s.id).map((l) => (
                      <span
                        key={l}
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: LINE_COLORS[l] }}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                  <span className="min-w-0 truncate">
                    <span className="block font-medium">{isFa ? s.name.fa : s.name.en}</span>
                    <span className="block text-xs text-muted-foreground">{isFa ? s.name.en : s.name.fa}</span>
                  </span>
                  <span className="flex-1" aria-hidden="true" />
                  <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}

            {/* Divider + place results (online-only enhancement) */}
            {query.length >= 3 && (hasPlaceResults || placesLoading || isOffline) && (
              <>
                {hasStationResults && (
                  <li role="presentation" aria-hidden="true" className="mx-3 my-1 border-t border-border" />
                )}
                <li role="presentation" className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.places}
                </li>
                {isOffline ? (
                  <li role="presentation" className="px-3 py-2 text-xs text-muted-foreground md:px-4 md:text-sm">
                    {t.placeSearchOffline}
                  </li>
                ) : (
                  <>
                    {placesLoading && places.length === 0 && (
                      <li role="presentation" className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                        {t.searchingPlaces}
                      </li>
                    )}
                    {places.map((p, i) => (
                      <li key={`${p.lat}-${p.lng}-${i}`} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected="false"
                          onClick={() => {
                            onPlaceSelect?.({ lat: p.lat, lng: p.lng, name: p.displayName })
                            setOpen(false)
                            triggerRef.current?.focus()
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent focus:outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-4 md:py-2.5 md:text-base"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{p.displayName}</span>
                          </span>
                          <Building2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </>
                )}
              </>
            )}

            {/* No results */}
            {showNoResults && (
              <li role="presentation" className="px-3 py-6 text-center text-sm text-muted-foreground md:py-8 md:text-base">
                {t.noResults}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
