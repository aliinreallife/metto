"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { loadScheduleData } from "@/lib/schedule-utils";
import { WebMcpRegistrar } from "@/components/web-mcp";

type PlacePin = {
  lat: number;
  lng: number;
  label: string;
};

type MetroContextValue = {
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

export function MetroProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fa");
  const [mapMode, setMapModeState] = useState<"satellite" | "minimalist">("minimalist");
  const [originId, setOriginId] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [originPlace, setOriginPlace] = useState<PlacePin | null>(null);
  const [destPlace, setDestPlace] = useState<PlacePin | null>(null);

  // Hydrate from localStorage + preload schedule data.
  // Route + place selections survive tab switches via context already;
  // localStorage additionally survives full reloads (URL params win when
  // present — each page applies them over this on mount).
  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "fa") setLangState(saved);
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
    loadScheduleData();
  }, []);

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
    <MetroContext.Provider value={{ lang, setLang, mapMode, setMapMode, originId, setOriginId, destId, setDestId, originPlace, setOriginPlace, destPlace, setDestPlace }}>
      <WebMcpRegistrar />
      {children}
    </MetroContext.Provider>
  );
}
