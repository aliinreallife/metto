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
      {/* Keep a semantic page heading without consuming screen space. */}
      <h1 className="sr-only">
        {isFa ? "ایستگاه‌های مترو تهران" : "Tehran metro stations"}
      </h1>
      <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <StationsTab
          lang={lang}
          onSetDest={(id) => router.push(`/?to=${id}`)}
        />
      </div>
    </div>
  );
}
