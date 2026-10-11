"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Building2, ChevronDown, Loader2, MapPin } from "lucide-react"
import { STATION_MAP, searchStations } from "@/lib/route"
import { LINE_COLORS } from "@/lib/metro/lines"
import { getStationLines } from "@/lib/metro/selectors"
import { searchPlaces, type PlaceResult } from "@/lib/geocoding"
import { STRINGS, persianDigits, type Lang } from "@/lib/i18n"
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
  const listRef = useRef<HTMLUListElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  // Reset the active descendant when the query or open state changes. Done
  // during render (adjusting state from the previous render) so keyboard
  // users never see a stale highlight for a frame.
  const [prevQueryOpen, setPrevQueryOpen] = useState<string | null>(null)
  const queryOpenKey = `${open}:${query}`
  if (prevQueryOpen !== queryOpenKey) {
    setPrevQueryOpen(queryOpenKey)
    setActiveIndex(null)
  }
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- debounced async search orchestration with synchronous reset branches; equivalent render-derived state would desync the abort/timeout lifecycle.
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

  // Clear places when dropdown closes (transient search state must not
  // survive into the next opening).
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset-on-close for transient search state; the close originates from many handlers (outside click, Escape, selection, toggle), so a single effect is the reliable reset point.
      setPlaces([])
      setPlacesLoading(false)
      setQuery("")
      setActiveIndex(null)
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
    setActiveIndex(null)
    // Focus restore so keyboard users don't lose their place after Escape.
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  type ActiveOption =
    | { kind: "station"; stationId: string }
    | { kind: "place"; placeIndex: number }

  const activeOptions: ActiveOption[] = [
    ...results.map((s) => ({ kind: "station" as const, stationId: s.id })),
    ...places.map((_, i) => ({ kind: "place" as const, placeIndex: i })),
  ]

  function optionId(index: number) {
    return `${listboxId}-opt-${index}`
  }
  const activeId = activeIndex !== null && activeOptions[activeIndex] ? optionId(activeIndex) : undefined

  function selectActive(index: number) {
    const opt = activeOptions[index]
    if (!opt) return
    if (opt.kind === "station") {
      onChange(opt.stationId)
      setOpen(false)
      setActiveIndex(null)
      requestAnimationFrame(() => triggerRef.current?.focus())
    } else {
      const p = places[opt.placeIndex]
      if (p) {
        onPlaceSelect?.({ lat: p.lat, lng: p.lng, name: p.displayName })
        setOpen(false)
        setActiveIndex(null)
        requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation()
      closeAndRefocusTrigger()
      return
    }
    if (!open) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      e.preventDefault()
      if (activeOptions.length === 0) return
      if (e.key === "ArrowDown") {
        setActiveIndex((prev) => (prev === null ? 0 : (prev + 1) % activeOptions.length))
      } else if (e.key === "ArrowUp") {
        setActiveIndex((prev) =>
          prev === null ? activeOptions.length - 1 : (prev - 1 + activeOptions.length) % activeOptions.length,
        )
      } else if (e.key === "Home") {
        setActiveIndex(0)
      } else if (e.key === "End") {
        setActiveIndex(activeOptions.length - 1)
      }
      return
    }
    if (e.key === "Enter") {
      if (activeIndex !== null && activeOptions[activeIndex]) {
        e.preventDefault()
        selectActive(activeIndex)
      }
    }
  }

  useEffect(() => {
    if (activeIndex === null || !open) return
    const el = document.getElementById(`${listboxId}-opt-${activeIndex}`)
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open, listboxId])

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
        ? `${persianDigits(results.length, lang)} ${isFa ? "ایستگاه" : "stations"}`
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
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-4 md:py-3"
        >
          <span className={cn("size-2.5 shrink-0 rounded-full", accentClass)} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate" dir={isFa ? "rtl" : "ltr"}>
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
            <label htmlFor={inputId} className="sr-only">
              {placeholder}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              aria-label={placeholder}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              dir={isFa ? "rtl" : "ltr"}
              className="ios-no-zoom-input w-full rounded-md bg-muted px-3 py-2 text-start text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background md:px-4 md:py-2.5 md:text-base"
            />
          </div>
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-label={placeholder}
            className="max-h-64 overflow-y-auto py-1"
          >
            {query.length === 0 && onPlaceSelect && (
              <li role="presentation" dir={isFa ? "rtl" : "ltr"} className="px-3 py-2 text-center text-xs text-muted-foreground md:px-4 md:py-2.5 md:text-sm">
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
            {results.map((s, sIndex) => {
              const isActive = activeIndex === sIndex
              return (
              <li
                key={s.id}
                id={optionId(sIndex)}
                role="option"
                aria-selected={value === s.id}
                onMouseEnter={() => setActiveIndex(sIndex)}
                onClick={() => {
                  onChange(s.id)
                  setOpen(false)
                  setActiveIndex(null)
                  triggerRef.current?.focus()
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent",
                  value === s.id && "bg-accent",
                  isActive && "bg-accent",
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
              </li>
              )
            })}

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
                    {places.map((p, i) => {
                      const placeOptionIndex = results.length + i
                      const isActivePlace = activeIndex === placeOptionIndex
                      return (
                      <li
                        key={`${p.lat}-${p.lng}-${i}`}
                        id={optionId(placeOptionIndex)}
                        role="option"
                        aria-selected="false"
                        onMouseEnter={() => setActiveIndex(placeOptionIndex)}
                        onClick={() => {
                          onPlaceSelect?.({ lat: p.lat, lng: p.lng, name: p.displayName })
                          setOpen(false)
                          setActiveIndex(null)
                          triggerRef.current?.focus()
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent md:px-4 md:py-2.5 md:text-base",
                          isActivePlace && "bg-accent",
                        )}
                      >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{p.displayName}</span>
                          </span>
                          <Building2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                      </li>
                      )
                    })}
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
