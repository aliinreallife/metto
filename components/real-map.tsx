"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Plus, Minus, Locate } from "lucide-react"
import { LINE_COLORS, STATIONS } from "@/lib/metro-data"
import { buildLineEdges } from "@/lib/graph"
import { STATION_MAP, type RouteResult } from "@/lib/route"
import { type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Props = {
  lang: Lang
  mapMode: "satellite" | "schematic"
  route: RouteResult | null
  originId: string | null
  destId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  initialCenter?: [number, number]
  initialZoom?: number
  onViewChange?: (center: [number, number], zoom: number) => void
  placeMarkers?: Array<{ lat: number; lng: number; label: string; role: "origin" | "dest" }>
}

const TEHRAN_CENTER: [number, number] = [35.7, 51.38]

const SATELLITE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
const SATELLITE_ATTR = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
const LABELS_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"

export function RealMap({ lang, mapMode, route, originId, destId, selectedId, onSelect, initialCenter, initialZoom, onViewChange, placeMarkers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const labelsLayerRef = useRef<L.TileLayer | null>(null)
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null)
  const placeLayerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Map<string, { marker: L.CircleMarker; station: typeof STATIONS[0] }>>(new Map())
  const labelStateRef = useRef({ routeStations: new Set<string>(), originId: null as string | null, destId: null as string | null, selectedId: null as string | null })
  const [hasGps, setHasGps] = useState(false)
  const isFa = lang === "fa"

  const edges = useMemo(() => buildLineEdges(), [])
  const routeStations = useMemo(() => new Set(route?.path ?? []), [route])
  const routeEdgeKeys = useMemo(() => {
    const set = new Set<string>()
    if (route) for (const h of route.hops) set.add([h.from, h.to].sort().join("|") + "|" + h.line)
    return set
  }, [route])

  // Keep label state ref in sync
  labelStateRef.current = { routeStations, originId, destId, selectedId }

  // Initialize the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = L.map(containerRef.current, {
      center: initialCenter ?? TEHRAN_CENTER,
      zoom: initialZoom ?? 11,
      zoomControl: false,
      attributionControl: true,
    })

    // Start in satellite mode
    const tileLayer = L.tileLayer(SATELLITE_URL, {
      maxZoom: 18,
      attribution: SATELLITE_ATTR,
    }).addTo(map)
    tileLayerRef.current = tileLayer

    const labelsLayer = L.tileLayer(LABELS_URL, {
      maxZoom: 18,
      opacity: 0.7,
    }).addTo(map)
    labelsLayerRef.current = labelsLayer

    overlayRef.current = L.layerGroup().addTo(map)
    placeLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // Zoom-based label visibility
    function updateLabels() {
      const zoom = map.getZoom()
      const { routeStations: currentRoute, originId: currentOrigin, destId: currentDest, selectedId: currentSelected } = labelStateRef.current
      const hasRoute = currentRoute.size > 0
      for (const [id, { marker, station }] of markersRef.current) {
        const isInterchange = station.lines.length > 1
        const isOnRoute = currentRoute.has(id)
        const isEndpoint = currentOrigin && currentDest && currentOrigin !== currentDest && (id === currentOrigin || id === currentDest)
        const isSelected = id === currentSelected

        // Always show: route stations, endpoints, selected
        if (isOnRoute || isEndpoint || isSelected) {
          marker.openTooltip()
          continue
        }
        // Show all stations at zoom >= 14 (including interchanges even with route)
        if (zoom >= 14) {
          marker.openTooltip()
          continue
        }
        // When route is active, hide non-route interchange labels below zoom 14
        if (hasRoute && isInterchange) {
          marker.closeTooltip()
          continue
        }
        // Show interchanges at zoom >= 12 (no route active)
        if (isInterchange && zoom >= 12) {
          marker.openTooltip()
          continue
        }
        // Otherwise hide
        marker.closeTooltip()
      }
    }
    map.on("zoomend", updateLabels)

    // Report view changes to parent.
    const onViewChangeRef = { current: onViewChange }
    map.on("moveend", () => {
      onViewChangeRef.current?.([map.getCenter().lat, map.getCenter().lng], map.getZoom())
    })

    // Leaflet needs a size invalidation after layout settles.
    setTimeout(() => map.invalidateSize(), 100)
    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
      tileLayerRef.current = null
      labelsLayerRef.current = null
      gpsMarkerRef.current = null
      placeLayerRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // Toggle tile layers when mapMode changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const container = map.getContainer()

    if (mapMode === "satellite") {
      if (tileLayerRef.current && !map.hasLayer(tileLayerRef.current)) tileLayerRef.current.addTo(map)
      if (labelsLayerRef.current && !map.hasLayer(labelsLayerRef.current)) labelsLayerRef.current.addTo(map)
      container.style.backgroundColor = ""
    } else {
      if (tileLayerRef.current && map.hasLayer(tileLayerRef.current)) map.removeLayer(tileLayerRef.current)
      if (labelsLayerRef.current && map.hasLayer(labelsLayerRef.current)) map.removeLayer(labelsLayerRef.current)
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim()
      container.style.backgroundColor = bg || "#fff"
    }
  }, [mapMode])

  // Redraw overlay whenever the route/selection changes.
  useEffect(() => {
    const layer = overlayRef.current
    if (!layer) return
    layer.clearLayers()
    const hasRoute = !!route

    // Lines
    for (const e of edges) {
      const a = STATION_MAP.get(e.a)
      const b = STATION_MAP.get(e.b)
      if (!a || !b) continue
      const inRoute = routeEdgeKeys.has([e.a, e.b].sort().join("|") + "|" + e.line)
      L.polyline(
        [
          [a.lat, a.lng],
          [b.lat, b.lng],
        ],
        {
          color: LINE_COLORS[e.line],
          weight: inRoute ? 6 : 4,
          opacity: hasRoute ? (inRoute ? 1 : 0.25) : 0.85,
        },
      ).addTo(layer)
    }

    // Stations
    markersRef.current.clear()
    for (const s of STATIONS) {
      const interchange = s.lines.length > 1
      const onRoute = routeStations.has(s.id)
      const isEndpoint = originId && destId && originId !== destId && (s.id === originId || s.id === destId)
      const dim = hasRoute && !onRoute
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: isEndpoint ? 8 : interchange ? 6 : 4,
        color: isEndpoint ? "#cc0e2d" : interchange ? "#111" : LINE_COLORS[s.lines[0]],
        weight: isEndpoint ? 3 : interchange ? 2 : 1.5,
        fillColor: interchange ? "#fff" : LINE_COLORS[s.lines[0]],
        fillOpacity: dim ? 0.3 : 1,
        opacity: dim ? 0.4 : 1,
      })
      marker.bindTooltip(isFa ? s.fa : s.name, {
        direction: "top",
        className: "station-label",
      })
      marker.on("click", () => onSelect(s.id))
      markersRef.current.set(s.id, { marker, station: s })
      marker.addTo(layer)
    }

    // Update label visibility based on current zoom
    const map = mapRef.current
    if (map) {
      const zoom = map.getZoom()
      const hasRoute = routeStations.size > 0
      for (const [id, { marker, station }] of markersRef.current) {
        const isInterchange = station.lines.length > 1
        const isOnRoute = routeStations.has(id)
        const isEndpoint = originId && destId && originId !== destId && (id === originId || id === destId)
        const isSelected = id === selectedId
        if (isOnRoute || isEndpoint || isSelected) {
          marker.openTooltip()
        } else if (zoom >= 14) {
          marker.openTooltip()
        } else if (hasRoute && isInterchange) {
          marker.closeTooltip()
        } else if (isInterchange && zoom >= 12) {
          marker.openTooltip()
        } else {
          marker.closeTooltip()
        }
      }
    }

    // Re-add GPS marker on top if it exists
    if (gpsMarkerRef.current) gpsMarkerRef.current.addTo(layer)
  }, [edges, route, routeStations, routeEdgeKeys, originId, destId, selectedId, isFa, onSelect])

  // Fit to the route bounds when it changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !route || route.path.length === 0) return
    const pts = route.path
      .map((id) => STATION_MAP.get(id))
      .filter(Boolean)
      .map((s) => [s!.lat, s!.lng] as [number, number])
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 14 })
  }, [route])

  // Render place markers when placeMarkers prop changes.
  useEffect(() => {
    const map = mapRef.current
    const layer = placeLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    if (!placeMarkers || placeMarkers.length === 0) return

    const PLACE_STYLE = {
      origin: {
        bg: "#22c55e",
        shadow: "#16a34a",
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><defs><filter id="os" x="-20%" y="-10%" width="140%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/></filter></defs><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#22c55e" filter="url(#os)"/><circle cx="14" cy="13" r="6" fill="white"/></svg>`,
      },
      dest: {
        bg: "#ef4444",
        shadow: "#dc2626",
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><defs><filter id="ds" x="-20%" y="-10%" width="140%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/></filter></defs><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#ef4444" filter="url(#ds)"/><circle cx="14" cy="13" r="6" fill="white"/></svg>`,
      },
    } as const

    const pts: [number, number][] = []
    for (const pm of placeMarkers) {
      const s = PLACE_STYLE[pm.role]
      const icon = L.divIcon({
        html: s.svg,
        className: "",
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        tooltipAnchor: [0, -40],
      })
      const marker = L.marker([pm.lat, pm.lng], { icon }).addTo(layer)
      marker.bindTooltip(pm.label, { direction: "top", className: "station-label" })
      pts.push([pm.lat, pm.lng])
    }

    if (pts.length === 1) {
      map.setView(pts[0], 14)
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14 })
    }
  }, [placeMarkers])

  function locateMe() {
    if (!mapRef.current || !navigator.geolocation) return
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
        marker.bindTooltip(isFa ? "شما اینجا هید" : "You are here", { direction: "top" })
        gpsMarkerRef.current = marker
        setHasGps(true)

        // Pan to location
        map.setView([lat, lng], 14)
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" aria-label="Tehran metro on real map" />
      <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-1.5">
        <MapBtn label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
          <Plus className="size-4" />
        </MapBtn>
        <MapBtn label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
          <Minus className="size-4" />
        </MapBtn>
        <MapBtn label="Locate me" onClick={locateMe}>
          <Locate className="size-4" />
        </MapBtn>
      </div>
    </div>
  )
}

function MapBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent",
      )}
    >
      {children}
    </button>
  )
}
