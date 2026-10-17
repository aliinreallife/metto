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
    document.title = isFa
      ? "ایستگاه‌های مترو تهران | امکانات و خطوط | متو"
      : "Tehran Metro Stations | Amenities & Lines | metto";
  }, [isFa]);

  return (
    <div className="flex size-full flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="text-base font-bold md:text-lg">
            {isFa ? "ایستگاه‌های مترو تهران" : "Tehran metro stations"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
            {isFa
              ? "ایستگاه‌ها را جستجو کن و خطوط، زمان‌بندی و امکانات هر ایستگاه را ببین."
              : "Search stations and see each station's lines, timetable, and amenities."}
          </p>
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <StationsTab
          lang={lang}
          onSetDest={(id) => router.push(`/?to=${id}`)}
        />
      </div>
    </div>
  );
}
