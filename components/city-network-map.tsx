"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CITY_LINES, type CityEdge, type CityStation } from "@/lib/city-catalog";
import { CITIES } from "@/lib/cities";
import { STRINGS, type Lang } from "@/lib/i18n";
import { Plus, Minus } from "lucide-react";
import styles from "./real-map.module.css";

const EMPTY_PATH: string[] = [];

export function CityNetworkMap({ stations, edges, lang, selectedId, pathIds = EMPTY_PATH, onSelect, showCity, mapMode }: {
  stations: CityStation[]; edges: CityEdge[]; lang: Lang; selectedId?: string;
  pathIds?: string[]; onSelect: (id: string) => void; showCity: boolean;
  mapMode: "satellite" | "minimalist";
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const baseLayer = useRef<L.TileLayer | null>(null);
  const [tileUnavailable, setTileUnavailable] = useState(false);
  const t = STRINGS[lang];
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, { zoomControl: false, scrollWheelZoom: true });
    map.current = instance;
    const bounds = L.latLngBounds(stations.map(s => [s.location.lat, s.location.lng] as [number, number]));
    if (stations.length) instance.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
    layer.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(host.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; layer.current = null; };
    // A city change mounts a new map; selections redraw only the overlay.
  }, [stations]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (baseLayer.current) instance.removeLayer(baseLayer.current);
    const key = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY;
    const minimalist = mapMode === "minimalist";
    const tiles = L.tileLayer(minimalist
      ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${key ? `?key=${key}` : ""}`
      : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      className: minimalist ? styles.basemap : "",
      attribution: minimalist ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>' : 'Tiles &copy; Esri',
      maxZoom: 19,
    }).addTo(instance);
    baseLayer.current = tiles;
    tiles.on("tileerror", () => setTileUnavailable(true));
    tiles.on("tileload", () => setTileUnavailable(false));
    return () => { instance.removeLayer(tiles); baseLayer.current = null; };
  }, [mapMode, stations]);
  useEffect(() => {
    const overlay = layer.current;
    if (!overlay) return;
    const focusedId = document.activeElement?.getAttribute("data-station-id");
    overlay.clearLayers();
    const byId = new Map(stations.map(s => [s.id, s]));
    const colors = new Map(CITY_LINES.map(l => [l.id, l.color]));
    const path = new Set(pathIds);
    for (const edge of edges) {
      const a = byId.get(edge.from), b = byId.get(edge.to);
      // Global maps must never draw a connection between cities.
      if (!a || !b || a.cityId !== b.cityId) continue;
      const active = path.has(a.id) && path.has(b.id);
      L.polyline([[a.location.lat, a.location.lng], [b.location.lat, b.location.lng]], {
        color: colors.get(edge.lineId) ?? "#cc0e2d", weight: active ? 6 : 3,
        opacity: path.size ? active ? 1 : 0.25 : 0.85,
        dashArray: edge.status === "operational" ? undefined : "3 5",
      }).addTo(overlay);
    }
    for (const station of stations) {
      const city = CITIES.find(c => c.slug === station.cityId)!;
      const baseName = showCity ? `${station.names[lang]} · ${city.name[lang]}` : station.names[lang];
      const name = station.status === "operational" ? baseName : `${baseName} · ${t.underConstruction}`;
      const active = station.id === selectedId || path.has(station.id);
      const color = active ? "#cc0e2d" : colors.get(station.lineIds[0]) ?? "#555";
      const icon = L.divIcon({ className: "city-station-marker", iconSize: [44, 44], iconAnchor: [22, 22],
        html: `<span style="display:block;margin:${active ? 16 : 18}px;width:${active ? 12 : 8}px;height:${active ? 12 : 8}px;border:1px ${station.status === "operational" ? "solid" : "dashed"} #fff;border-radius:50%;background:${color}"></span>` });
      const marker = L.marker([station.location.lat, station.location.lng], { icon, keyboard: true, title: name, alt: name })
        .addTo(overlay).on("click", () => onSelect(station.id));
      const element = marker.getElement();
      if (element) {
        element.setAttribute("aria-label", name); element.setAttribute("data-station-id", station.id);
        element.addEventListener("keydown", e => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault(); e.stopPropagation(); onSelect(station.id);
          }
        });
        if (focusedId === station.id) element.focus({ preventScroll: true });
      }
      const label = document.createElement("span"); label.textContent = name; label.lang = lang; label.dir = lang === "fa" ? "rtl" : "ltr";
      // Keep the overview readable on phones; a tap or keyboard selection
      // shows the station name and actions without stacking every label.
      marker.bindTooltip(label, { permanent: station.id === selectedId, direction: "top", opacity: 0.95 });
    }
  }, [stations, edges, lang, selectedId, pathIds, showCity, onSelect, t.underConstruction]);
  return <div className="relative h-full min-h-80 w-full" data-testid="city-network-map" data-station-count={stations.length} data-route-station-count={pathIds.length}>
    <div ref={host} className="absolute inset-0" style={{ backgroundColor: "#151515" }} role="region" aria-label={t.tabMap} />
    <div className={`absolute end-3 z-[650] flex flex-col gap-1.5 ${selectedId ? "top-14" : "bottom-7"}`}>
      <button type="button" aria-label={t.cityZoomIn} onClick={() => map.current?.zoomIn()} className="flex size-11 items-center justify-center rounded-lg border border-border bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"><Plus aria-hidden="true" className="size-4" /></button>
      <button type="button" aria-label={t.cityZoomOut} onClick={() => map.current?.zoomOut()} className="flex size-11 items-center justify-center rounded-lg border border-border bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"><Minus aria-hidden="true" className="size-4" /></button>
    </div>
    {tileUnavailable && <p role="status" className="pointer-events-none absolute inset-x-12 bottom-8 z-[500] rounded-lg border bg-background p-2 text-center text-xs text-foreground">{t.cityMapBackgroundUnavailable}</p>}
  </div>;
}
