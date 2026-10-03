"use client";

import { useEffect, useMemo, useState } from "react";
import { useMetro } from "@/app/providers";
import { persianDigits } from "@/lib/i18n";

export type TehranClock = {
  /** Wall-clock seconds since midnight in Tehran. */
  seconds: number;
  /** 24h HH:MM shaped for the active language. */
  time: string;
  /** Localised date line (Jalali in Persian). */
  date: string;
  weekday: string;
};

function pad(v: number) {
  return String(v).padStart(2, "0");
}

export function useTehranClock(): TehranClock {
  const { lang } = useMetro();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    let h = 0;
    let m = 0;
    let s = 0;
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tehran",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date(now));
      for (const part of parts) {
        if (part.type === "hour") h = Number(part.value) % 24;
        if (part.type === "minute") m = Number(part.value);
        if (part.type === "second") s = Number(part.value);
      }
    } catch {
      const d = new Date(now);
      h = d.getHours();
      m = d.getMinutes();
      s = d.getSeconds();
    }

    const timeLocale = lang === "fa" ? "fa-IR" : "en-GB";
    let date = "";
    let weekday = "";
    try {
      date = new Intl.DateTimeFormat(timeLocale, {
        timeZone: "Asia/Tehran",
        day: "numeric",
        month: "long",
      }).format(new Date(now));
      weekday = new Intl.DateTimeFormat(timeLocale, {
        timeZone: "Asia/Tehran",
        weekday: "long",
      }).format(new Date(now));
    } catch {
      /* ignore */
    }

    return {
      seconds: h * 3600 + m * 60 + s,
      time: persianDigits(`${pad(h)}:${pad(m)}`, lang),
      date: lang === "fa" ? persianDigits(date, lang) : date,
      weekday,
    };
  }, [now, lang]);
}
