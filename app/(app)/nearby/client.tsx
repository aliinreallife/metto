"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NearbyTab } from "@/components/nearby-tab";
import { useMetro } from "@/app/providers";

export function NearbyPage() {
  const router = useRouter();
  const { lang } = useMetro();
  const isFa = lang === "fa";

  useEffect(() => {
    document.title = isFa
      ? "نزدیک‌ترین ایستگاه مترو به من | متو"
      : "Nearest Metro Station | metto";
  }, [isFa]);

  return (
    <div className="flex size-full flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="text-base font-bold md:text-lg">
            {isFa ? "نزدیک‌ترین ایستگاه مترو به من" : "Nearest metro station"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
            {isFa
              ? "موقعیتت را بده یا یک ایستگاه انتخاب کن؛ نزدیک‌ترین گزینه‌ها، فاصله و امکانات را ببین."
              : "Use your location or choose a station to see the nearest options, distance, and amenities."}
          </p>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <NearbyTab
          lang={lang}
          onSetDest={(id) => router.push(`/?to=${id}`)}
        />
      </div>
    </div>
  );
}
