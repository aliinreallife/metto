"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TrainFront,
  Globe,
  Route as RouteIcon,
  ListTree,
  LocateFixed,
  Map as MapIcon,
  ExternalLink,
  Database,
} from "lucide-react";
import { InstallButton } from "@/components/pwa";
import { OfflineStatus } from "@/components/offline-status";
import { useMetro } from "./providers";
import { STRINGS } from "@/lib/i18n";
import { buildTabHref } from "@/lib/geo";
import {
  isPrecachedTabUrl,
  shouldInterceptOfflineNav,
  useConnectivity,
  type ConnectivityState,
} from "@/lib/offline/use-connectivity";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", labelKey: "tabRoute" as const, icon: RouteIcon },
  { href: "/stations", labelKey: "tabStations" as const, icon: ListTree },
  { href: "/nearby", labelKey: "tabNearby" as const, icon: LocateFixed },
  { href: "/map", labelKey: "tabMap" as const, icon: MapIcon },
] as const;

/**
 * Top-level tab link. When effectively online it behaves exactly like Next
 * <Link> (client navigation + prefetch). Otherwise (offline, or still
 * checking — the safe default since destinations are precached), plain
 * primary clicks on the four precached static tabs use a native
 * full-document navigation instead: client-side RSC fetches cannot succeed
 * offline and would abort the transition, while a document request is
 * served from the Serwist precache. Modifier/middle clicks, new-tab targets
 * and non-precached URLs keep normal browser semantics.
 *
 * Offline-ness is decided synchronously at event time from BOTH the shared
 * connectivity state and the live `navigator.onLine` getter: React state
 * can lag a just-fired offline event by a frame, and a tap landing in that
 * window must still take the safe path (a failed client navigation leaves
 * a broken intermediate tree). Bias is deliberate — full-document
 * navigation works online too for precached tabs, while a client
 * navigation while offline always breaks.
 */
function TabLink({
  href,
  connectivity,
  className,
  ariaCurrent,
  children,
}: {
  href: string;
  connectivity: ConnectivityState;
  className?: string;
  ariaCurrent?: "page";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-current={ariaCurrent}
      onClick={(e) => {
        if (e.defaultPrevented) return;
        if (
          !shouldInterceptOfflineNav({
            button: e.button,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            target: (e.currentTarget as HTMLAnchorElement).target,
          })
        ) {
          return;
        }
        if (!isPrecachedTabUrl(href)) return;
        const stateOffline = connectivity !== "online";
        let linkOffline = false;
        try {
          linkOffline =
            typeof navigator !== "undefined" && navigator.onLine === false;
        } catch {
          linkOffline = false;
        }
        // Normal Next behavior only when BOTH agree we are online.
        if (!stateOffline && !linkOffline) return;
        e.preventDefault();
        window.location.assign(href);
      }}
    >
      {children}
    </Link>
  );
}

export function AppNav() {
  const { lang, setLang, originId, destId, originPlace, destPlace } = useMetro();
  const pathname = usePathname();
  const t = STRINGS[lang];
  // One shared subscription for every tab link below.
  const { state: connectivity } = useConnectivity();

  const currentPath = pathname === "/" ? "/" : pathname;
  const isMainTab = currentPath === "/";

  function getHref(base: string) {
    // Preserve each side independently plus place pins on every tab, so
    // tab switches (and reloads) never drop selections or landmarks.
    return buildTabHref(base, {
      from: originId,
      to: destId,
      originPlace,
      destPlace,
    });
  }

  function toggleLang() {
    const next = lang === "en" ? "fa" : "en";
    setLang(next);
  }

  return (
    <>
      <header className="z-20 flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur md:px-6 md:py-4">
          <TabLink href="/" connectivity={connectivity} className="flex items-center gap-2.5 md:gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground md:size-10">
            <TrainFront className="size-5 md:size-6" />
          </span>
          <div className="leading-tight">
            <h1 className="text-base font-bold md:text-lg">{t.appTitle}</h1>
            <p className="text-xs text-muted-foreground md:text-sm">{t.appSubtitle}</p>
          </div>
        </TabLink>

        {/* desktop tabs */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const href = getHref(item.href);
            const active = currentPath === item.href;
            return (
              <TabLink
                key={item.href}
                href={href}
                connectivity={connectivity}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:gap-2 md:px-4 md:py-2.5 md:text-base",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="size-5" />
                {t[item.labelKey]}
              </TabLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <InstallButton label={t.install} iosHintLabel={t.installIosHint} iosHintSteps={t.installIosSteps} />
          <button
            type="button"
            onClick={toggleLang}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-medium transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-3 md:py-2.5 md:text-base"
            aria-label={
              lang === "en"
                ? "فارسی — Toggle language"
                : "EN — تغییر زبان"
            }
          >
            <Globe className="size-4 md:size-5" />
            {lang === "en" ? "فارسی" : "EN"}
          </button>
        </div>
      </header>

      <OfflineStatus lang={lang} />

      {/* mobile bottom tab bar - fixed to viewport bottom; credits sit
          directly on top with zero gap, main tab only. z-50 sits above the
          isolated map stacking context (z-0), so Leaflet's internal
          z-800/z-1000 layers can never cover it. */}
      <div data-testid="mobile-tabbar" className="fixed bottom-0 inset-x-0 z-50 flex flex-col border-t border-border bg-card md:hidden">
        {isMainTab && (
        <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-0.5 px-4 py-1.5">
          <a
            href="https://github.com/aliinreallife"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3 text-primary" />
            <span className="text-muted-foreground">{t.builtBy}</span>
            <span className="font-semibold text-foreground">aliinreallife</span>
            <span className="sr-only"> ({t.opensInNewTab})</span>
          </a>
          <a
            href="https://github.com/mostafa-kheibary/tehran-metro-data"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] transition-colors hover:text-foreground"
          >
            <Database className="size-3 text-primary" />
            <span className="text-muted-foreground">{t.dataBy}</span>
            <span className="font-semibold text-foreground">
              mostafa-kheibary
            </span>
            <span className="sr-only"> ({t.opensInNewTab})</span>
          </a>
        </div>
        )}
        <nav className={cn("grid grid-cols-4 pb-[env(safe-area-inset-bottom)]", isMainTab && "border-t border-border")}>
          {NAV_ITEMS.map((item) => {
            const href = getHref(item.href);
            const active = currentPath === item.href;
            return (
              <TabLink
                key={item.href}
                href={href}
                connectivity={connectivity}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                ariaCurrent={active ? "page" : undefined}
              >
                <item.icon className="size-5" />
                {t[item.labelKey]}
              </TabLink>
            );
          })}
        </nav>
      </div>
    </>
  );
}
