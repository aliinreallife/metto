"use client";

import { useMetro } from "@/app/providers";

export default function Loading() {
  const { lang } = useMetro();
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">
          {lang === "fa" ? "در حال بارگذاری نقشه…" : "Loading map…"}
        </p>
      </div>
    </div>
  );
}
