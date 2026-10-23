"use client";

import { useEffect, useRef } from "react";
import { useMetro } from "@/app/providers";
import { WELCOME_CONTENT } from "./content";
import { Hero } from "./components/Hero";
import { Donate } from "./components/Donate";
import { PwaStrip } from "./components/PwaStrip";
import { WelcomeFooter } from "./components/WelcomeFooter";
import { CITIES, type CityId } from "@/lib/cities";
import { cityCounts } from "@/lib/city-catalog";
import { persianDigits } from "@/lib/i18n";

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "آیا متو رایگان است؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "بله. همه چیز رایگان است و نیازی به ثبت‌نام یا پرداخت نیست. هیچ تبلیغی هم نمایش داده نمی‌شود.",
      },
    },
    {
      "@type": "Question",
      name: "کدام شهرها پشتیبانی می‌شوند؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "در حال حاضر مترو تهران با ۱۵۱ ایستگاه و ۷ خط. شهرهای دیگر به‌مرور اضافه می‌شوند.",
      },
    },
    {
      "@type": "Question",
      name: "آیا آفلاین کار می‌کند؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "بله. متو روی گوشی نصب می‌شود و پوسته برنامه و داده ایستگاه‌ها ذخیره می‌شود، بنابراین داخل مترو بدون اینترنت هم باز می‌شود.",
      },
    },
    {
      "@type": "Question",
      name: "داده‌ها از کجاست؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "دادهٔ ایستگاه‌ها از مجموعه‌داده‌های باز هر شهر و OpenStreetMap تهیه شده است. زمان‌بندی قطارها برای تهران در دسترس است.",
      },
    },
  ],
};

export function WelcomePage({ cityId }: { cityId?: CityId }) {
  const { lang, cityIds } = useMetro();
  const t = WELCOME_CONTENT[lang];
  const dir = lang === "fa" ? "rtl" : "ltr";
  const scrollContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  // Landing fast-path, evaluated in order with full-document navigation
  // (client routing cannot succeed offline, and replace() keeps history
  // clean either way). The inline script above already handles the common
  // case pre-paint; this effect is the fallback. Cases:
  // 1. Old share links (metto.ir/?from=…&to=…) redirect server-side to
  //    /route when online. If this page still renders with route params
  //    (an offline cold open served from precache), hand off client-side.
  // 2. Returning visitors (this browser has used the planner before — the
  //    "route.seen" flag) skip the intro and go straight back to the app
  //    they love, UNLESS the URL carries a hash (e.g. /#donate from the
  //    app footer): an explicit hash is intentional navigation to landing
  //    content and must not bounce back to /route. First-timers, bots
  //    (clean storage: no flag, so crawlers always index the landing),
  //    and private mode (storage throws: fall through to the landing)
  //    are unaffected.
  useEffect(() => {
    if (cityId) return;
    const search = window.location.search;
    if (/[?&](from|to)=/.test(search)) {
      window.location.replace(`/route${search}`);
      return;
    }
    // Intentional in-app footer navigation (/#donate) must stay put.
    if (window.location.hash && window.location.hash.length > 1) return;
    try {
      if (localStorage.getItem("route.seen") === "1") {
        const saved = localStorage.getItem("city.last");
        window.location.replace(`${saved === "mashhad" && cityIds.includes("mashhad") ? "/mashhad/route" : "/route"}${search}`);
      }
    } catch {
      // Private mode etc. — show the landing.
    }
  }, [cityId, cityIds]);

  // Cold full-document loads (direct link, share, mobile footer
  // window.location.assign) land at the top: neither the browser nor Next
  // performs the anchor jump into this page's inner scroll container, so an
  // explicit hash like /#donate would silently stay put. Scroll to the
  // target here instead. Instant (auto): this is anchor navigation, not
  // animation. Focus is deliberately left alone — visual scroll only.
  useEffect(() => {
    const scrollToHash = () => {
      try {
        const hash = window.location.hash;
        if (!hash || hash.length <= 1) return;
        // During hydration recovery the previous server tree may briefly
        // coexist with this one. Scroll this mounted page, not that old tree.
        const el = scrollContainer.current?.querySelector(`#${CSS.escape(hash.slice(1))}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "auto", block: "start" });
      } catch {
        // A broken hash must never break the landing.
      }
    };
    scrollToHash();
    // Language restoration changes section heights, and Next can restore
    // scroll during hydration. Reassert the explicit destination after layout.
    const frame = window.requestAnimationFrame(scrollToHash);
    // Late assets (fonts/images) can shift layout after the first scroll;
    // re-assert once everything settled. hashchange covers in-page jumps.
    window.addEventListener("hashchange", scrollToHash);
    window.addEventListener("load", scrollToHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", scrollToHash);
      window.removeEventListener("load", scrollToHash);
    };
  }, [lang]);

  // Block layout for the scroll container (not flex): children stack at
  // content height and this container scrolls. A flex column here would
  // starve <main> of height and shrink its overflow-hidden sections to zero.
  return (
    <div ref={scrollContainer} dir={dir} className="min-h-0 flex-1 overflow-y-auto bg-background pb-[env(safe-area-inset-bottom)] text-foreground">
      {/* Synchronous pre-paint redirect: old ?from/to links and the
          returning-visitor flag ("route.seen") both land on /route BEFORE
          first paint, so there is no flash-of-landing. Parser-blocking by
          design — keep this the first node. Crawlers and first-timers have
          no flag, so they always render the landing. An explicit hash
          (e.g. /#donate from the app footer) is intentional navigation
          and never redirects. The React effect below
          is the fallback (e.g. if inline scripts are stripped). */}
      {!cityId && <script
        dangerouslySetInnerHTML={{
          __html: `try{var s=location.search,h=location.hash;if(!h||h.length<=1){if(/[?&](from|to)=/.test(s)){location.replace("/route"+s)}else if(localStorage.getItem("route.seen")==="1"){location.replace(${cityIds.includes("mashhad") ? '(localStorage.getItem("city.last")==="mashhad"?"/mashhad/route":"/route")' : '"/route"'}+s)}}}catch(e){}`,
        }}
      />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ ...FAQ_JSON_LD, mainEntity: FAQ_JSON_LD.mainEntity.map((q, i) => i === 1 ? { ...q, acceptedAnswer: { ...q.acceptedAnswer, text: `${CITIES.filter(c => cityIds.includes(c.slug) && (!cityId || c.slug === cityId)).map(c => c.name.fa).join("، ")} · ${persianDigits(cityCounts(cityIds, cityId).stations, "fa")} ایستگاه` } } : q) }) }} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground"
      >
        {t.misc.skip}
      </a>
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        <Hero cityId={cityId} />
        <Donate />
        <PwaStrip />
      </main>
      <WelcomeFooter cityId={cityId} />
    </div>
  );
}
