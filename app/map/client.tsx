"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Loader2, Layers, Satellite } from "lucide-react";
import { useMetro } from "@/app/providers";
import { STATION_MAP, findRoute } from "@/lib/route";
import { STRINGS } from "@/lib/i18n";
import { StationDetail } from "@/components/station-detail";
import { cn } from "@/lib/utils";

const RealMap = dynamic(
  () => import("@/components/real-map").then((m) => m.RealMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    ),
  },
);

export function MapPage() {
  const searchParams = useSearchParams();
  const { lang, mapMode, setMapMode } = useMetro();
  const t = STRINGS[lang];
  const isFa = lang === "fa";

  useEffect(() => {
    const title = isFa ? "نقشه مترو تهران" : "Tehran Metro Map";
    const suffix = isFa ? " | متو" : " | Metto";
    document.title = title + suffix;
  }, [isFa]);

  const initialParams = useMemo(() => {
    const mapParam = searchParams.get("map");
    let center: [number, number] = [35.7, 51.38];
    let zoom = 11;
    if (mapParam) {
      const parts = mapParam.split(",").map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        center = [parts[0], parts[1]];
        zoom = parts[2];
      }
    }
    const station = searchParams.get("station");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    return { center, zoom, station, from, to };
  }, [searchParams]);

  const route = useMemo(() => {
    if (!initialParams.from || !initialParams.to || initialParams.from === initialParams.to) return null;
    return findRoute(initialParams.from, initialParams.to);
  }, [initialParams.from, initialParams.to]);

  const [selectedId, setSelectedId] = useState<string | null>(initialParams.station);
  const [mapView, setMapView] = useState<{ center: [number, number]; zoom: number }>({
    center: initialParams.center,
    zoom: initialParams.zoom,
  });

  const selected = selectedId ? STATION_MAP.get(selectedId) : null;

  const handleViewChange = useCallback((center: [number, number], zoom: number) => {
    setMapView({ center, zoom });
  }, []);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <RealMap
        lang={lang}
        mapMode={mapMode}
        route={route}
        originId={initialParams.from}
        destId={initialParams.to}
        selectedId={selectedId}
        onSelect={setSelectedId}
        initialCenter={mapView.center}
        initialZoom={mapView.zoom}
        onViewChange={handleViewChange}
      />

      {/* Map mode toggle */}
      <div className="absolute top-3 left-3 z-[500] flex overflow-hidden rounded-lg border border-border bg-background/90 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setMapMode("satellite")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
            mapMode === "satellite"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          <Satellite className="size-3.5" />
          {t.satellite}
        </button>
        <button
          type="button"
          onClick={() => setMapMode("minimalist")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
            mapMode === "minimalist"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          <Layers className="size-3.5" />
          {t.minimalist}
        </button>
      </div>

      {selected && (
        <div className="absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-md">
          <StationDetail
            station={selected}
            lang={lang}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}
