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
}

const TEHRAN_CENTER: [number, number] = [35.7, 51.38]

const SATELLITE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
const SATELLITE_ATTR = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
const LABELS_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"

export function RealMap({ lang, mapMode, route, originId, destId, selectedId, onSelect, initialCenter, initialZoom, onViewChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const labelsLayerRef = useRef<L.TileLayer | null>(null)
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null)
  const [hasGps, setHasGps] = useState(false)
  const isFa = lang === "fa"

  const edges = useMemo(() => buildLineEdges(), [])
  const routeStations = useMemo(() => new Set(route?.path ?? []), [route])
  const routeEdgeKeys = useMemo(() => {
    const set = new Set<string>()
    if (route) for (const h of route.hops) set.add([h.from, h.to].sort().join("|") + "|" + h.line)
    return set
  }, [route])

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
    mapRef.current = map

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
    for (const s of STATIONS) {
      const interchange = s.lines.length > 1
      const onRoute = routeStations.has(s.id)
      const isEndpoint = s.id === originId || s.id === destId
      const dim = hasRoute && !onRoute
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: isEndpoint ? 8 : interchange ? 6 : 4,
        color: isEndpoint ? "#cc0e2d" : interchange ? "#111" : LINE_COLORS[s.lines[0]],
        weight: isEndpoint ? 3 : interchange ? 2 : 1.5,
        fillColor: interchange ? "#fff" : LINE_COLORS[s.lines[0]],
        fillOpacity: dim ? 0.3 : 1,
        opacity: dim ? 0.4 : 1,
      })
      marker.bindTooltip(isFa ? s.fa : s.name, { direction: "top" })
      marker.on("click", () => onSelect(s.id))
      if (s.id === selectedId) marker.addTo(layer).openTooltip()
      else marker.addTo(layer)
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
