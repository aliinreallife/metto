import { Suspense, type ReactNode } from "react";
import { AppNav } from "../nav";
import AppLoading from "@/components/app-loading";
import { AppSkipLink } from "./skip-link";

// Layout for the functional app routes (/route, /stations, /nearby, /map).
// The landing page at / renders standalone without the app chrome.
export default function AppLayout({ children, ssrContent = false }: { children: ReactNode; ssrContent?: boolean }) {
  return (
    <>
      <AppSkipLink />
      <Suspense fallback={null}><AppNav /></Suspense>
      <main id="main-content" tabIndex={-1} className="relative min-h-0 flex-1 flex flex-col overflow-hidden pb-[60px] pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0">
        {ssrContent ? children : <Suspense fallback={<AppLoading />}>{children}</Suspense>}
      </main>
    </>
  );
}
