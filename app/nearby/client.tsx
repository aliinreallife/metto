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
    const title = isFa ? "نزدیک‌ترین ایستگاه مترو" : "Nearby Metro Stations";
    const suffix = isFa ? " | متو" : " | Metto";
    document.title = title + suffix;
  }, [isFa]);

  return (
    <div className="flex size-full flex-col bg-background text-foreground">
      <div className="relative min-h-0 flex-1">
        <NearbyTab
          lang={lang}
          onSetOrigin={(id) => router.push(`/?from=${id}`)}
          onSetDest={(id) => router.push(`/?to=${id}`)}
        />
      </div>
    </div>
  );
}
