import type { ReactNode } from "react";
import { AppNav } from "../nav";

// Layout for the functional app routes (/route, /stations, /nearby, /map).
// The landing page at / renders standalone without the app chrome.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <AppNav />
      <main
        id="main-content"
        tabIndex={-1}
        className="relative min-h-0 flex-1 flex flex-col overflow-hidden pb-[60px] pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0"
      >
        {children}
      </main>
    </>
  );
}
