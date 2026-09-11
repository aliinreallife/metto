"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Plus, Minus, LocateFixed, Loader2 } from "lucide-react"
import { LINE_COLORS } from "@/lib/metro/lines";
import {
  buildMapEdges,
  getAllStations,
  getStationLines,
  getStationTerminalRoutes,
  isInterchange,
} from "@/lib/metro/selectors";
import {
  placeLabels,
  type Anchor,
  type DotObstacle,
  type LabelCandidate,
} from "@/lib/map/label-placement";
import type { MetroStation } from "@/lib/metro/types";
import { STATION_MAP, type RouteResult } from "@/lib/route"
import { type Lang } from "@/lib/i18n"
import { useConnectivity, type ConnectivityState } from "@/lib/offline/use-connectivity"
import { cn } from "@/lib/utils"

type Props = {
  lang: Lang
  mapMode: "satellite" | "minimalist"
  route: RouteResult | null
  originId: string | null
  destId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  initialCenter?: [number, number]
  initialZoom?: number
  onViewChange?: (center: [number, number], zoom: number) => void
  placeMarkers?: Array<{ lat: number; lng: number; label: string; role: "origin" | "dest"; stationId?: string | null }>
}

const TEHRAN_CENTER: [number, number] = [35.7, 51.38]

const SATELLITE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
const SATELLITE_ATTR = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
const LABELS_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY
// CARTO serves raster tiles without a key (with an "API key required"
// watermark) — far better than a blank map. Append the key only when set,
// and never gate layer creation on it: a missing key must degrade to
// watermarked tiles, not to zero tile layers (white/blank background).
const MINIMALIST_URL = CARTO_KEY
  ? `https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
  : `https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png`
const MINIMALIST_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'

// ---- Station label layer (screen-space placement, no Leaflet tooltips) ----

// Priority: selected > hovered > origin/destination > route > interchange >
// terminal/major > normal. Only the forced set must always render.
const LABEL_PRIORITY: Record<"selected" | "hovered" | "endpoint" | "route" | "interchange" | "terminal" | "normal", number> = {
  selected: 100,
  hovered: 90,
  endpoint: 80,
  route: 60,
  interchange: 50,
  terminal: 40,
  normal: 10,
}

// Real-DOM measurement cache: key = `${lang}:${text}`. Invalidated when fonts
// load and cleared of stale entries on language switch (bounded by station count).
const measureCache = new Map<string, { w: number; h: number }>()
let measureEl: HTMLDivElement | null = null

function ensureMeasureEl(container: HTMLElement): HTMLDivElement {
  if (!measureEl || !container.contains(measureEl)) {
    measureEl = document.createElement("div")
    measureEl.className = "station-label station-measure"
    measureEl.setAttribute("aria-hidden", "true")
    container.appendChild(measureEl)
  }
  return measureEl
}

function measureStationLabel(
  container: HTMLElement,
  text: string,
  lang: Lang,
): { w: number; h: number } {
  const key = `${lang}:${text}`
  const hit = measureCache.get(key)
  if (hit) return hit
  const el = ensureMeasureEl(container)
  el.setAttribute("dir", lang === "fa" ? "rtl" : "ltr")
  el.textContent = text
  const size = { w: Math.ceil(el.offsetWidth), h: Math.ceil(el.offsetHeight) }
  measureCache.set(key, size)
  return size
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function buildLabelIcon(
  text: string,
  lang: Lang,
  geom: { x: number; y: number; w: number; h: number; anchor: Anchor },
  stationPoint: { x: number; y: number },
): L.DivIcon {
  return L.divIcon({
    className: "station-dom-label-wrap",
    html:
      `<div class="station-label station-dom-label" dir="${lang === "fa" ? "rtl" : "ltr"}"` +
      ` data-x="${geom.x.toFixed(1)}" data-y="${geom.y.toFixed(1)}"` +
      ` data-w="${geom.w}" data-h="${geom.h}" data-anchor="${geom.anchor}">` +
      `${escapeHtml(text)}</div>`,
    iconSize: [geom.w, geom.h],
    // Pin the icon so its top-left lands on the computed rect: the station
    // point sits at (stationPoint - rectTopLeft) inside the icon.
    iconAnchor: [stationPoint.x - geom.x, stationPoint.y - geom.y],
  })
}

export function RealMap({ lang, mapMode, route, originId, destId, selectedId, onSelect, initialCenter, initialZoom, onViewChange, placeMarkers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const labelsLayerRef = useRef<L.TileLayer | null>(null)
  const minimalistLayerRef = useRef<L.TileLayer | null>(null)
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null)
  const placeLayerRef = useRef<L.LayerGroup | null>(null)
  const stationLabelsRef = useRef<L.LayerGroup | null>(null)
  const labelNodesRef = useRef<Map<string, { marker: L.Marker; key: string }>>(new Map())
  const prevAnchorRef = useRef<Map<string, Anchor>>(new Map())
  const hoveredRef = useRef<string | null>(null)
  const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const markersRef = useRef<Map<string, { marker: L.CircleMarker; station: MetroStation; radius: number }>>(new Map())
  const initialMapModeRef = useRef(mapMode)
  initialMapModeRef.current = mapMode
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const labelStateRef = useRef({ routeStations: new Set<string>(), originId: null as string | null, destId: null as string | null, selectedId: null as string | null, hoveredId: null as string | null, lang: lang as Lang })
  // Landmark labels (searched-place pins, GPS dot) rendered through the same
  // engine as station labels. Keys are namespaced ("place:origin", "gps")
  // so they never collide with station ids.
  const extraLabelStateRef = useRef<Array<{ key: string; lat: number; lng: number; text: string }>>([])
  const [hasGps, setHasGps] = useState(false)
  const [gpsPos, setGpsPos] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const isFa = lang === "fa"
  const { state: connectivity } = useConnectivity()
  // Tracks the previous SETTLED connectivity state so only a real
  // offline → online transition triggers a retry. The machine always
  // interposes "checking" between offline and online on the event-driven
  // path, so comparing consecutive renders would consume the edge on the
  // checking render and never redraw. In particular, a settled
  // online → … → online resync (e.g. pageshow while already online) must
  // not redraw: nothing failed, so there is nothing to retry. An initial
  // online mount is likewise not a transition.
  const lastSettledConnectivityRef = useRef<ConnectivityState | null>(
    connectivity === "checking" ? null : connectivity,
  )

  const edges = useMemo(() => buildMapEdges(), [])
  const routeStations = useMemo(() => new Set(route?.path ?? []), [route])
  const routeEdgeKeys = useMemo(() => {
    const set = new Set<string>()
    if (route) for (const h of route.hops) set.add([h.from, h.to].sort().join("|") + "|" + h.line)
    return set
  }, [route])

  // Keep label state ref in sync
  labelStateRef.current = { routeStations, originId, destId, selectedId, hoveredId: hoveredRef.current, lang }
  // Landmark label inputs for the engine (short pin names + GPS dot).
  {
    const extras: Array<{ key: string; lat: number; lng: number; text: string }> = []
    if (placeMarkers) {
      for (const pm of placeMarkers) {
        extras.push({ key: `place:${pm.role}`, lat: pm.lat, lng: pm.lng, text: pm.label })
      }
    }
    if (gpsPos) {
      extras.push({
        key: "gps",
        lat: gpsPos[0],
        lng: gpsPos[1],
        text: lang === "fa" ? "شما اینجا هستید" : "You are here",
      })
    }
    extraLabelStateRef.current = extras
  }

  function scheduleLabels(immediate = false) {
    if (scheduleTimerRef.current) clearTimeout(scheduleTimerRef.current)
    if (immediate) {
      scheduleTimerRef.current = null
      updateStationLabels()
      return
    }
    // Trailing debounce: coalesces zoomend+moveend bursts and hover flutters.
    scheduleTimerRef.current = setTimeout(() => {
      scheduleTimerRef.current = null
      updateStationLabels()
    }, 50)
  }

  // Re-run placement when landmark labels change (pins, GPS, language).
  useEffect(() => {
    scheduleLabels()
  }, [placeMarkers, gpsPos, lang])

  function updateStationLabels() {
    const map = mapRef.current
    const layer = stationLabelsRef.current
    if (!map || !layer) return
    const container = map.getContainer()
    const { routeStations: currentRoute, originId: currentOrigin, destId: currentDest, selectedId: currentSelected, hoveredId: currentHovered, lang: currentLang } = labelStateRef.current
    const zoom = map.getZoom()
    const size = map.getSize()
    const viewport = { width: size.x, height: size.y }
    const hasEndpoints = !!currentOrigin && !!currentDest && currentOrigin !== currentDest

    const candidates: LabelCandidate[] = []
    const dots: DotObstacle[] = []
    for (const [id, { station, radius }] of markersRef.current) {
      const p = map.latLngToContainerPoint([station.location.lat, station.location.lng])
      const point = { x: p.x, y: p.y }
      dots.push({ id, point, radius })

      const isSelected = id === currentSelected
      const isHovered = id === currentHovered
      const isEndpoint = hasEndpoints && (id === currentOrigin || id === currentDest)
      const isOnRoute = currentRoute.has(id)
      const interchange = isInterchange(id)

      // Zoom pre-filter: becoming a candidate does NOT guarantee rendering;
      // the collision engine may still hide lower-priority labels.
      let candidate = isSelected || isHovered || isEndpoint || isOnRoute
      if (!candidate && zoom >= 14) candidate = true
      else if (!candidate && zoom >= 12 && interchange) candidate = true
      if (!candidate) continue

      const text = currentLang === "fa" ? station.name.fa : station.name.en
      const { w, h } = measureStationLabel(container, text, currentLang)
      let priority = LABEL_PRIORITY.normal
      let forced = false
      if (isSelected) {
        priority = LABEL_PRIORITY.selected
        forced = true
      } else if (isHovered) {
        priority = LABEL_PRIORITY.hovered
        forced = true
      } else if (isEndpoint) {
        priority = LABEL_PRIORITY.endpoint
        forced = true
      } else if (isOnRoute) {
        priority = LABEL_PRIORITY.route
      } else if (interchange) {
        priority = LABEL_PRIORITY.interchange
      } else if (getStationTerminalRoutes(id).length > 0) {
        priority = LABEL_PRIORITY.terminal
      }
      candidates.push({
        id,
        point,
        width: w,
        height: h,
        priority,
        forced,
        prevAnchor: prevAnchorRef.current.get(id) ?? null,
      })
    }

    // Landmark labels (searched places, GPS dot) go through the same
    // engine so they look and collide like station labels — always forced.
    // Places have no marker art, so their label anchors right at the
    // coordinate; the GPS label sits just above its dot.
    const extraByKey = new Map(extraLabelStateRef.current.map((e) => [e.key, e]))
    for (const extra of extraLabelStateRef.current) {
      const p = map.latLngToContainerPoint([extra.lat, extra.lng])
      const isGps = extra.key === "gps"
      const point = { x: p.x, y: p.y - (isGps ? 12 : 0) }
      dots.push({ id: extra.key, point, radius: isGps ? 4 : 2 })
      const { w, h } = measureStationLabel(container, extra.text, currentLang)
      candidates.push({
        id: extra.key,
        point,
        width: w,
        height: h,
        priority: LABEL_PRIORITY.endpoint,
        forced: true,
        prevAnchor: prevAnchorRef.current.get(extra.key) ?? null,
      })
    }

    const placements = placeLabels(candidates, dots, viewport)
    const alive = new Set<string>()
    for (const pl of placements) {
      if (pl.hidden || !pl.anchor) {
        prevAnchorRef.current.delete(pl.id)
        const existing = labelNodesRef.current.get(pl.id)
        if (existing) {
          existing.marker.remove()
          labelNodesRef.current.delete(pl.id)
        }
        continue
      }
      const entry = markersRef.current.get(pl.id)
      const extra = entry ? null : extraByKey.get(pl.id)
      if (!entry && !extra) continue
      alive.add(pl.id)
      prevAnchorRef.current.set(pl.id, pl.anchor)
      const text = entry
        ? currentLang === "fa"
          ? entry.station.name.fa
          : entry.station.name.en
        : extra!.text
      const c = candidates.find((k) => k.id === pl.id)!
      const src = entry
        ? { lat: entry.station.location.lat, lng: entry.station.location.lng }
        : { lat: extra!.lat, lng: extra!.lng }
      const p = map.latLngToContainerPoint([src.lat, src.lng])
      const key = `${text}|${c.width}x${c.height}|${pl.anchor}|${pl.x.toFixed(1)},${pl.y.toFixed(1)}`
      const existing = labelNodesRef.current.get(pl.id)
      if (existing && existing.key === key) continue
      const icon = buildLabelIcon(text, currentLang, { x: pl.x, y: pl.y, w: c.width, h: c.height, anchor: pl.anchor }, { x: p.x, y: p.y })
      if (existing) {
        existing.marker.setIcon(icon)
        existing.key = key
      } else {
        const marker = L.marker([src.lat, src.lng], {
          icon,
          interactive: !!entry,
          keyboard: false,
        })
        // Station labels are tappable like dots; landmark labels are
        // display-only (the pin itself keeps its hover tooltip).
        // Labels are non-draggable Leaflet markers and do not block panning.
        if (entry) marker.on("click", () => onSelectRef.current(pl.id))
        marker.addTo(layer)
        labelNodesRef.current.set(pl.id, { marker, key })
      }
    }
    // Drop nodes whose stations are no longer candidates at all.
    for (const [id, { marker }] of labelNodesRef.current) {
      if (!alive.has(id)) {
        marker.remove()
        labelNodesRef.current.delete(id)
        prevAnchorRef.current.delete(id)
      }
    }
  }

  // Initialize the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = L.map(containerRef.current, {
      center: initialCenter ?? TEHRAN_CENTER,
      zoom: initialZoom ?? 11,
      zoomControl: false,
      attributionControl: true,
    })

    // Start in the current map mode (no full remount needed when toggling later)
    const tileLayer = L.tileLayer(SATELLITE_URL, {
      maxZoom: 18,
      attribution: SATELLITE_ATTR,
    })
    tileLayerRef.current = tileLayer

    const labelsLayer = L.tileLayer(LABELS_URL, {
      maxZoom: 18,
      opacity: 0.7,
    })
    labelsLayerRef.current = labelsLayer

    const minimalistLayer = L.tileLayer(MINIMALIST_URL, {
      maxZoom: 20,
      attribution: MINIMALIST_ATTR,
      subdomains: "abcd",
      // Anonymous CORS (CARTO serves Access-Control-Allow-Origin: *):
      // tile fetches become CORS requests with exposed status, so the
      // service worker caches real `cors` responses instead of opaque
      // ones — avoiding Chromium's ~7MB-per-entry opaque quota padding.
      // Esri layers intentionally stay non-CORS (online-only, uncached).
      crossOrigin: "anonymous",
    })
    minimalistLayerRef.current = minimalistLayer
    if (!CARTO_KEY) {
      console.warn(
        "NEXT_PUBLIC_CARTO_BASEMAP_KEY is missing; using watermarked CARTO tiles.",
      )
    }

    if (initialMapModeRef.current === "satellite") {
      tileLayer.addTo(map)
      labelsLayer.addTo(map)
    } else {
      minimalistLayer.addTo(map)
    }

    overlayRef.current = L.layerGroup().addTo(map)
    stationLabelsRef.current = L.layerGroup().addTo(map)
    placeLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // Screen-space label placement: recompute only when the view settles,
    // never every animation frame.
    const relayout = () => scheduleLabels()
    map.on("zoomend", relayout)
    map.on("moveend", relayout)
    map.on("resize", relayout)
    // Initial placement once tiles/layout settle.
    scheduleLabels()

    // Re-measure with the real webfont once it arrives (Persian glyph widths
    // change vs. fallback) and relay out so anchors stay glued to dots.
    let fontsCancelled = false
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (fontsCancelled) return
        measureCache.clear()
        scheduleLabels(true)
      })
    }

    // Report view changes to parent.
    const onViewChangeRef = { current: onViewChange }
    map.on("moveend", () => {
      onViewChangeRef.current?.([map.getCenter().lat, map.getCenter().lng], map.getZoom())
    })

    // Leaflet needs a size invalidation after layout settles.
    setTimeout(() => map.invalidateSize(), 100)
    return () => {
      fontsCancelled = true
      map.off("zoomend", relayout)
      map.off("moveend", relayout)
      map.off("resize", relayout)
      if (scheduleTimerRef.current) clearTimeout(scheduleTimerRef.current)
      map.remove()
      mapRef.current = null
      overlayRef.current = null
      stationLabelsRef.current = null
      labelNodesRef.current.clear()
      prevAnchorRef.current.clear()
      if (measureEl) {
        measureEl.remove()
        measureEl = null
      }
      tileLayerRef.current = null
      labelsLayerRef.current = null
      minimalistLayerRef.current = null
      gpsMarkerRef.current = null
      placeLayerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // Toggle basemap layers when mapMode changes (mutually exclusive).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const container = map.getContainer()

    if (mapMode === "satellite") {
      if (minimalistLayerRef.current && map.hasLayer(minimalistLayerRef.current)) map.removeLayer(minimalistLayerRef.current)
      if (tileLayerRef.current && !map.hasLayer(tileLayerRef.current)) tileLayerRef.current.addTo(map)
      if (labelsLayerRef.current && !map.hasLayer(labelsLayerRef.current)) labelsLayerRef.current.addTo(map)
      container.style.backgroundColor = ""
    } else {
      if (tileLayerRef.current && map.hasLayer(tileLayerRef.current)) map.removeLayer(tileLayerRef.current)
      if (labelsLayerRef.current && map.hasLayer(labelsLayerRef.current)) map.removeLayer(labelsLayerRef.current)
      if (minimalistLayerRef.current && !map.hasLayer(minimalistLayerRef.current)) minimalistLayerRef.current.addTo(map)
      container.style.backgroundColor = ""
    }
  }, [mapMode])

  // Retry the active basemap layer(s) when EFFECTIVE connectivity returns,
  // so tiles that failed while offline start loading without any zoom/pan
  // gesture. Runs only on a settled offline → online transition of the
  // shared state ("checking" renders are skipped, so the machine's
  // offline → checking → online recovery still redraws exactly once,
  // while online → checking → online resyncs never do). No remount, no
  // view reset, no overlay or cache touch.
  useEffect(() => {
    if (connectivity === "checking") return
    const wasSettled = lastSettledConnectivityRef.current
    lastSettledConnectivityRef.current = connectivity
    if (wasSettled !== "offline" || connectivity !== "online") return
    const map = mapRef.current
    if (!map) return
    for (const layer of [tileLayerRef.current, minimalistLayerRef.current, labelsLayerRef.current]) {
      if (layer && map.hasLayer(layer)) layer.redraw()
    }
  }, [connectivity])

  // Redraw overlay whenever the route/selection changes.
  useEffect(() => {
    const layer = overlayRef.current
    if (!layer) return
    layer.clearLayers()
    const hasRoute = !!route

    // Lines. Under-construction segments render dotted so track construction
    // is visually distinct from station construction.
    for (const e of edges) {
      const a = STATION_MAP.get(e.a)
      const b = STATION_MAP.get(e.b)
      if (!a || !b) continue
      const inRoute = routeEdgeKeys.has([e.a, e.b].sort().join("|") + "|" + e.line)
      const underConstruction = e.status !== "operational"
      L.polyline(
        [
          [a.location.lat, a.location.lng],
          [b.location.lat, b.location.lng],
        ],
        {
          color: LINE_COLORS[e.line],
          weight: inRoute ? 6 : 4,
          opacity: hasRoute ? (inRoute ? 1 : 0.25) : underConstruction ? 0.55 : 0.85,
          dashArray: underConstruction ? "2 6" : undefined,
        },
      ).addTo(layer)
    }

    // Stations. Under-construction stations render with a dotted border and
    // transparent fill, independently of segment styling.
    // Labels are NOT Leaflet tooltips anymore: dots stay interactive for
    // click/hover, and names render in the dedicated label layer via the
    // screen-space placement engine (updateStationLabels).
    markersRef.current.clear()
    const dotRadius = (s: MetroStation) => {
      const endpoint = originId && destId && originId !== destId && (s.id === originId || s.id === destId)
      if (endpoint) return 8
      if (isInterchange(s.id)) return 6
      return 4
    }
    for (const s of getAllStations()) {
      const lines = getStationLines(s.id)
      const firstLine = lines[0]
      const interchange = isInterchange(s.id)
      const onRoute = routeStations.has(s.id)
      const isEndpoint = originId && destId && originId !== destId && (s.id === originId || s.id === destId)
      const dim = hasRoute && !onRoute
      const underConstruction = s.status !== "operational"
      const radius = dotRadius(s)
      const marker = L.circleMarker([s.location.lat, s.location.lng], {
        radius,
        color: isEndpoint ? "#cc0e2d" : interchange ? "#111" : LINE_COLORS[firstLine],
        weight: underConstruction ? 1.5 : isEndpoint ? 3 : interchange ? 2 : 1.5,
        dashArray: underConstruction ? "3 3" : undefined,
        fillColor: underConstruction ? "transparent" : interchange ? "#fff" : LINE_COLORS[firstLine],
        fillOpacity: underConstruction ? 0 : dim ? 0.3 : 1,
        opacity: dim ? 0.4 : 1,
        interactive: true,
      })
      marker.on("click", () => onSelect(s.id))
      marker.on("mouseover", () => {
        if (hoveredRef.current !== s.id) {
          hoveredRef.current = s.id
          labelStateRef.current.hoveredId = s.id
          scheduleLabels()
        }
      })
      marker.on("mouseout", () => {
        if (hoveredRef.current === s.id) {
          hoveredRef.current = null
          labelStateRef.current.hoveredId = null
          scheduleLabels()
        }
      })
      markersRef.current.set(s.id, { marker, station: s, radius })
      marker.addTo(layer)
    }

    // (Re)run placement for the current zoom/route/selection/language.
    scheduleLabels()

    // Re-add GPS marker on top if it exists
    if (gpsMarkerRef.current) gpsMarkerRef.current.addTo(layer)
  }, [edges, route, routeStations, routeEdgeKeys, originId, destId, selectedId, isFa, onSelect])

  // Fit to the route bounds when it changes (no place pins: keep old behavior).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !route || route.path.length === 0) return
    if (placeMarkers && placeMarkers.length > 0) return
    const pts = route.path
      .map((id) => STATION_MAP.get(id))
      .filter(Boolean)
      .map((s) => [s!.location.lat, s!.location.lng] as [number, number])
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 14 })
  }, [route, placeMarkers])

  // Render place markers when placeMarkers prop changes.
  useEffect(() => {
    const map = mapRef.current
    const layer = placeLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    if (!placeMarkers || placeMarkers.length === 0) return

    // No pin markers: places are marked by their engine label plus the
    // dashed walk connector below. GPS keeps its blue dot.
    const pts: [number, number][] = []
    for (const pm of placeMarkers) {
      pts.push([pm.lat, pm.lng])

      // Dashed "walk" connector from the searched place to its station.
      const st = pm.stationId ? STATION_MAP.get(pm.stationId) : null
      if (st) {
        L.polyline(
          [
            [pm.lat, pm.lng],
            [st.location.lat, st.location.lng],
          ],
          {
            color: pm.role === "origin" ? "#22c55e" : "#ef4444",
            weight: 3,
            opacity: 0.9,
            dashArray: "6 6",
          },
        ).addTo(layer)
        pts.push([st.location.lat, st.location.lng])
      }
    }

    // Include the metro route so the place stays in context (e.g. Iran Mall
    // far from its station still shows the line).
    if (route && route.path.length > 0) {
      for (const id of route.path) {
        const st = STATION_MAP.get(id)
        if (st) pts.push([st.location.lat, st.location.lng])
      }
    }

    if (pts.length === 1) {
      map.setView(pts[0], 14)
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14 })
    }
  }, [placeMarkers, route])

  function locateMe() {
    if (!mapRef.current || !navigator.geolocation) {
      setGpsError(isFa ? "موقعیت شما به‌دست نیامد." : "Couldn't get your location.")
      return
    }
    setLocating(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current
        if (!map) return
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude

        // Remove old GPS marker
        if (gpsMarkerRef.current) {
          gpsMarkerRef.current.remove()
          gpsMarkerRef.current = null
        }

        // Create pulsing GPS marker
        const marker = L.circleMarker([lat, lng], {
          radius: 8,
          color: "#3b82f6",
          weight: 3,
          fillColor: "#60a5fa",
          fillOpacity: 0.9,
          opacity: 1,
        }).addTo(map)
        // No hover tooltip: the always-visible engine label (via gpsPos)
        // is the single label for the dot.
        gpsMarkerRef.current = marker
        setHasGps(true)
        setGpsPos([lat, lng])

        // Pan to location
        map.setView([lat, lng], 14)
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        // Offline with a cached fix still succeeds above; only genuine
        // failures land here (denied/unavailable/timeout).
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? isFa
              ? "دسترسی به موقعیت رد شد."
              : "Location access denied."
            : isFa
              ? "موقعیت شما به‌دست نیامد."
              : "Couldn't get your location.",
        )
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    // Isolated stacking context: Leaflet paints panes (z-200..700) and
    // controls (z-800/1000) inside this z-0 context, so no tile, marker,
    // popup, or attribution layer can ever cover app chrome (bottom nav
    // z-50) no matter how panes transform while panning/zooming.
    <div className="metto-map relative isolate z-0 h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="Tehran metro on real map" />
      {gpsError && (
        <div className="absolute bottom-[calc(0.75rem+var(--metto-map-bottom-clearance,0px))] left-3 z-[1000] max-w-[70%] rounded-lg border border-border bg-background/95 px-3 py-1.5 text-xs text-destructive shadow-sm backdrop-blur">
          {gpsError}
        </div>
      )}
      <div className="absolute bottom-[calc(0.75rem+var(--metto-map-bottom-clearance,0px))] right-3 z-[1000] flex flex-col gap-1.5">
        <MapBtn label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
          <Plus className="size-4" />
        </MapBtn>
        <MapBtn label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
          <Minus className="size-4" />
        </MapBtn>
        <MapBtn label="Locate me" onClick={locateMe} disabled={locating}>
          {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
        </MapBtn>
      </div>
    </div>
  )
}

function MapBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent disabled:opacity-50",
      )}
    >
      {children}
    </button>
  )
}
