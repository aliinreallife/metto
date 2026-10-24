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
      <h1 className="sr-only">
        {isFa ? "نزدیک‌ترین ایستگاه مترو به من" : "Nearest metro station"}
      </h1>
      <div className="relative min-h-0 flex-1">
        <NearbyTab
          lang={lang}
          onSetDest={(id) => router.push(`/?to=${id}`)}
        />
      </div>
    </div>
  );
}
