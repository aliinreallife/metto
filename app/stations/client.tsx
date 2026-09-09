"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StationsTab } from "@/components/stations-tab";
import { useMetro } from "@/app/providers";

export function StationsPage() {
  const router = useRouter();
  const { lang } = useMetro();
  const isFa = lang === "fa";

  useEffect(() => {
    const title = isFa ? "ایستگاه‌های مترو تهران" : "Tehran Metro Stations";
    const suffix = isFa ? " | متو" : " | Metto";
    document.title = title + suffix;
  }, [isFa]);

  return (
    <div className="flex size-full flex-col bg-background text-foreground">
      <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <StationsTab
          lang={lang}
          onSetOrigin={(id) => router.push(`/?from=${id}`)}
          onSetDest={(id) => router.push(`/?to=${id}`)}
        />
      </div>
    </div>
  );
}
