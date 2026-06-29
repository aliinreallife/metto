"use client"

import { useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { LINE_COLORS, STATIONS } from "@/lib/metro-data"
import { buildLineEdges } from "@/lib/graph"
import { STATION_MAP, type RouteResult } from "@/lib/route"
import { type Lang } from "@/lib/i18n"

type Props = {
  lang: Lang
  route: RouteResult | null
  originId: string | null
  destId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

const TEHRAN_CENTER: [number, number] = [35.7, 51.38]

export function RealMap({ lang, route, originId, destId, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
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
      center: TEHRAN_CENTER,
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    })
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map)
    overlayRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    // Leaflet needs a size invalidation after layout settles.
    setTimeout(() => map.invalidateSize(), 100)
    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

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

  return <div ref={containerRef} className="size-full" aria-label="Tehran metro on real map" />
}
