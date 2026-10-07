import type { ReactNode } from "react";
import { AppNav } from "../nav";

// Layout for the functional app routes (/route, /stations, /nearby, /map).
// The landing page at / renders standalone without the app chrome.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppNav />
      <main className="relative min-h-0 flex-1 flex flex-col overflow-hidden pb-[60px] pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
    </>
  );
}
