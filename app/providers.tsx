"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { loadScheduleData } from "@/lib/schedule-utils";

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

  // Hydrate from localStorage + preload schedule data
  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "fa") setLangState(saved);
    const savedMode = localStorage.getItem("mapMode");
    if (savedMode === "satellite" || savedMode === "minimalist") setMapModeState(savedMode);
    else if (savedMode === "schematic") setMapModeState("minimalist");
    loadScheduleData();
  }, []);

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
      {children}
    </MetroContext.Provider>
  );
}
