"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { loadScheduleData } from "@/lib/schedule-utils";

type MetroContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  mapMode: "satellite" | "schematic";
  setMapMode: (m: "satellite" | "schematic") => void;
  originId: string | null;
  setOriginId: (id: string | null) => void;
  destId: string | null;
  setDestId: (id: string | null) => void;
};

const MetroContext = createContext<MetroContextValue | null>(null);

export function useMetro() {
  const ctx = useContext(MetroContext);
  if (!ctx) throw new Error("useMetro must be used within MetroProvider");
  return ctx;
}

export function MetroProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fa");
  const [mapMode, setMapModeState] = useState<"satellite" | "schematic">("schematic");
  const [originId, setOriginId] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);

  // Hydrate from localStorage + preload schedule data
  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "fa") setLangState(saved);
    const savedMode = localStorage.getItem("mapMode");
    if (savedMode === "satellite" || savedMode === "schematic") setMapModeState(savedMode);
    loadScheduleData();
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  }, []);

  const setMapMode = useCallback((m: "satellite" | "schematic") => {
    setMapModeState(m);
    localStorage.setItem("mapMode", m);
  }, []);

  return (
    <MetroContext.Provider value={{ lang, setLang, mapMode, setMapMode, originId, setOriginId, destId, setDestId }}>
      {children}
    </MetroContext.Provider>
  );
}
