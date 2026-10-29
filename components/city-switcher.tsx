"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMetro } from "@/app/providers";
import { CITIES, cityFromPath, cityHref, viewFromPath } from "@/lib/cities";
import { STRINGS } from "@/lib/i18n";
import { useConnectivity } from "@/lib/offline/use-connectivity";
import { cn } from "@/lib/utils";

export function CitySwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, cityIds } = useMetro();
  const pathname = usePathname(); const router = useRouter();
  const { state: connectivity } = useConnectivity();
  const t = STRINGS[lang]; const id = useId();
  const current = cityFromPath(pathname);
  const options = [...CITIES.filter(c => cityIds.includes(c.slug)).map(c => ({ value: c.slug, name: c.name[lang], preview: c.release === "preview" })),
    { value: "all" as const, name: t.allCities, preview: false }];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const choose = (next: typeof options[number]["value"]) => {
    close();
    if (next === current) return;
    try { if (next !== "all") localStorage.setItem("city.last", next); } catch { /* storage optional */ }
    // Carry language only: endpoints and timetable options belong to their city.
    const href = `${cityHref(next, viewFromPath(pathname))}?lang=${lang}`;
    // Offline city tabs need a document request so the service worker can serve HTML.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (connectivity !== "online" || navigator.onLine === false) window.location.assign(href);
    else router.push(href);
  };
  return <div ref={host} className="relative min-w-0">
    <button ref={trigger} type="button" role="combobox" aria-label={t.chooseCity}
      aria-expanded={open} aria-controls={`${id}-cities`} aria-haspopup="listbox"
      aria-activedescendant={open ? `${id}-${options[active].value}` : undefined}
      className={cn("flex max-w-40 items-center gap-1 rounded-md text-start transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        compact ? "-ms-1 min-h-7 px-1 text-xs text-muted-foreground md:text-sm" : "min-h-11 border border-border px-3 text-sm")}
      onClick={() => { setActive(Math.max(0, options.findIndex(o => o.value === current))); setOpen(!open); }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) { event.preventDefault(); close(); }
        else if (event.key === "Tab") setOpen(false);
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          if (!open) { setOpen(true); setActive(Math.max(0, options.findIndex(o => o.value === current))); }
          else setActive(index => event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        } else if (open && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); choose(options[active].value); }
      }}>
      {!compact && <MapPin aria-hidden="true" className="size-3.5 shrink-0" />}
      <span className="truncate">{options.find(o => o.value === current)?.name}</span>
      {options.find(o => o.value === current)?.preview && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/80">{t.cityPreviewLabel}</span>}
      <ChevronDown aria-hidden="true" className={cn("size-3 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
    </button>
    {open && <ul id={`${id}-cities`} role="listbox" aria-label={t.chooseCity}
      className="absolute start-0 top-full z-[1100] mt-1 w-44 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg">
      {options.map((option, index) => <li key={option.value} id={`${id}-${option.value}`} role="option"
        aria-selected={current === option.value} onPointerMove={() => setActive(index)}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(option.value)}
        className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3", active === index && "bg-accent", option.value === "all" && "mt-1 border-t border-border rounded-t-none")}>
        <span className="flex-1">{option.name}</span>
        {option.preview && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/80">{t.cityPreviewLabel}</span>}
        {current === option.value && <Check aria-hidden="true" className="size-4 text-primary" />}
      </li>)}
    </ul>}
  </div>;
}
