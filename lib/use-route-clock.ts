"use client";

import { useEffect, useState } from "react";

export function useRouteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const visible = () => { if (!document.hidden) update(); };
    const timer = window.setInterval(visible, 15_000);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return now;
}
