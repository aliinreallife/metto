"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Human handoff: /share URLs open the identical state in the planner.
// Crawlers (no JS) stay on this document and read its metadata instead.
// FA-only v1 copy by design (see lib/route-share.ts).
function RedirectInner() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const href = query ? `/route?${query}` : "/route";

  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <div
      dir="rtl"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground"
    >
      <p className="text-base font-bold">در حال باز کردن مسیر…</p>
      <a
        href={href}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
      >
        باز کردن مسیر در متو
      </a>
    </div>
  );
}

export function ShareRedirect() {
  return (
    <Suspense fallback={null}>
      <RedirectInner />
    </Suspense>
  );
}
