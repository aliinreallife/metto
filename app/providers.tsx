"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { loadScheduleData, refreshScheduleData } from "@/lib/schedule-utils";
import { isAndroidTwa } from "@/lib/twa";
import { WebMcpRegistrar } from "@/components/web-mcp";
import { usePathname } from "next/navigation";
import { CITIES, cityFromPath, type CityId } from "@/lib/cities";

type PlacePin = {
  lat: number;
  lng: number;
  label: string;
};

type MetroContextValue = {
  cityIds: CityId[];
  lang: Lang;
  setLang: (l: Lang) => void;
  mapMode: "satellite" | "minimalist";
  setMapMode: (m: "satellite" | "minimalist") => void;
  originId: string | null;
  setOriginId: (id: string | null) => void;
  destId: string | null;
  setDestId: (id: string | null) => void;
  originPlace: PlacePin | null;
  setOriginPlace: (p: PlacePin | null) => void;
  destPlace: PlacePin | null;
  setDestPlace: (p: PlacePin | null) => void;
};

const MetroContext = createContext<MetroContextValue | null>(null);

function readPlacePin(key: string): PlacePin | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p: unknown = JSON.parse(raw);
    if (
      typeof p === "object" &&
      p !== null &&
      Number.isFinite((p as PlacePin).lat) &&
      Number.isFinite((p as PlacePin).lng) &&
      typeof (p as PlacePin).label === "string" &&
      (p as PlacePin).label.length > 0
    ) {
      const pin = p as PlacePin;
      return { lat: pin.lat, lng: pin.lng, label: pin.label };
    }
  } catch {
    // Corrupt entry — ignore and fall through.
  }
  return null;
}

export function useMetro() {
  const ctx = useContext(MetroContext);
  if (!ctx) throw new Error("useMetro must be used within MetroProvider");
  return ctx;
}

export function MetroProvider({ children, cityIds = ["tehran"] }: { children: ReactNode; cityIds?: CityId[] }) {
  const enabledCityIds = useMemo(() => CITIES.filter(c => cityIds.includes(c.slug)).map(c => c.slug), [cityIds]);
  const pathname = usePathname();
  // The new city preview has its own data and no timetable/MCP integration.
  // Never advertise Tehran tools or prime its timetable as Mashhad routing.
  const tehranScope = cityFromPath(pathname ?? "/") === "tehran";
  const [lang, setLangState] = useState<Lang>("fa");
  const [mapMode, setMapModeState] = useState<"satellite" | "minimalist">("minimalist");
  const [originId, setOriginId] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [originPlace, setOriginPlace] = useState<PlacePin | null>(null);
  const [destPlace, setDestPlace] = useState<PlacePin | null>(null);

  // Bounded retry chain for the initial timetable load. Runs only while
  // schedule data is still inactive (each success activates + notifies).
  // Stable identity so the mount-once primer effect below never refires.
  const primeScheduleWithRetry = useCallback(function prime(attempt: number) {
    const delays = [2000, 5000, 15000, 30000, 60000];
    const delay = delays[Math.min(attempt, delays.length - 1)];
    window.setTimeout(() => {
      void loadScheduleData().then(
        () => {
          void refreshScheduleData();
        },
        () => {
          if (attempt + 1 < delays.length) prime(attempt + 1);
        },
      );
    }, delay);
  }, []);

  // Hydrate from localStorage + preload schedule data.
  // Route + place selections survive tab switches via context already;
  // localStorage additionally survives full reloads (URL params win when
  // present — each page applies them over this on mount).
  useEffect(() => {
    // Warm the Android-TWA signal early: consumes the ?twa=android launcher
    // param (remember + strip) so location errors can offer the native
    // "Turn on location" action without waiting on first failure.
    void isAndroidTwa();
    const saved = localStorage.getItem("lang");
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (requested === "en" || requested === "fa") setLangState(requested);
    else if (saved === "en" || saved === "fa") setLangState(saved);
    const savedMode = localStorage.getItem("mapMode");
    if (savedMode === "satellite" || savedMode === "minimalist") setMapModeState(savedMode);
    else if (savedMode === "schematic") setMapModeState("minimalist");
    const savedFrom = localStorage.getItem("route.from");
    if (savedFrom) setOriginId((prev) => prev ?? savedFrom);
    const savedTo = localStorage.getItem("route.to");
    if (savedTo) setDestId((prev) => prev ?? savedTo);
    const savedOriginPlace = readPlacePin("route.originPlace");
    if (savedOriginPlace) setOriginPlace((prev) => prev ?? savedOriginPlace);
    const savedDestPlace = readPlacePin("route.destPlace");
    if (savedDestPlace) setDestPlace((prev) => prev ?? savedDestPlace);
    if (!tehranScope) return;
    loadScheduleData()
      // Start from last-known-good/bundled immediately; adopt a newer
      // validated timetable in the background without blocking first paint.
      .then(
        () => {
          void refreshScheduleData();
        },
        () => {
          // First attempt failed (offline boot before the SW takes over,
          // stalled fetch, corrupt entry with no fallback): retry with
          // backoff instead of leaving "Loading schedule..." up forever.
          // Capped chain; the 'online' listener below keeps recovering
          // across connectivity changes until load succeeds.
          primeScheduleWithRetry(0);
        },
      );
    function onOnline() {
      // Browser reports connectivity back — a failed primer may succeed now.
      // loadScheduleData dedupes concurrent attempts internally.
      void loadScheduleData().then(
        () => {
          void refreshScheduleData();
        },
        () => {
          primeScheduleWithRetry(0);
        },
      );
    }
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [primeScheduleWithRetry, tehranScope]);

  // Keep <html lang/dir> in sync with app language on every app route.
  // This is the shared boundary, so /stations, /nearby, and /map get it
  // for free (previously only /route and the landing page synced it).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  }, [lang]);
  // Persist route + place selections so they stick across reloads.
  useEffect(() => {
    if (originId) localStorage.setItem("route.from", originId);
    else localStorage.removeItem("route.from");
  }, [originId]);
  useEffect(() => {
    if (destId) localStorage.setItem("route.to", destId);
    else localStorage.removeItem("route.to");
  }, [destId]);
  useEffect(() => {
    if (originPlace) localStorage.setItem("route.originPlace", JSON.stringify(originPlace));
    else localStorage.removeItem("route.originPlace");
  }, [originPlace]);
  useEffect(() => {
    if (destPlace) localStorage.setItem("route.destPlace", JSON.stringify(destPlace));
    else localStorage.removeItem("route.destPlace");
  }, [destPlace]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  }, []);

  const setMapMode = useCallback((m: "satellite" | "minimalist") => {
    setMapModeState(m);
    localStorage.setItem("mapMode", m);
  }, []);

  return (
    <MetroContext.Provider value={{ cityIds: enabledCityIds, lang, setLang, mapMode, setMapMode, originId, setOriginId, destId, setDestId, originPlace, setOriginPlace, destPlace, setDestPlace }}>
      {tehranScope && <WebMcpRegistrar />}
      {children}
    </MetroContext.Provider>
  );
}
