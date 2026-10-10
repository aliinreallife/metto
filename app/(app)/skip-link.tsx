"use client";

import { useMetro } from "@/app/providers";
import { STRINGS } from "@/lib/i18n";

// Keyboard-only skip link for the app routes, mirroring the landing page
// pattern. Visually hidden until focused; jumps to <main id="main-content">.
export function AppSkipLink() {
  const { lang } = useMetro();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground"
    >
      {STRINGS[lang].skipToContent}
    </a>
  );
}
