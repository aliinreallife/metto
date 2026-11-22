# SEO release checklist

Run after any release that touches routes, redirects, metadata, sitemap,
or the landing page. Background: `/` is the landing, `/route` the planner;
old URLs redirect permanently (`/welcome` → `/`, `/?from&to` → `/route`).
`seo-routes.test.ts` locks this structure in CI — this checklist covers
what only a human with Search Console access can verify.

## 1. Crawlability (5 min, once per relevant release)

- `curl -s https://metto.ir/sitemap.xml` lists `/`, `/route`,
  `/stations`, `/map`, `/nearby` and no `/welcome`.
- `curl -sI https://metto.ir/welcome` → 308 to `/`;
  `curl -sI "https://metto.ir/?from=tajrish&to=tehran-sadeghiyeh"` → 308
  to `/route` with the query intact; plain `/` and `/?lang=en` → 200.
- View-source `/`: single `<link rel="canonical" href="https://metto.ir">`;
  `/route`: canonical `https://metto.ir/route`.
- Search Console → Sitemaps → resubmit `https://metto.ir/sitemap.xml`
  (only needed when URLs change, not for copy tweaks).

## 2. Rankings watch (2–4 weeks after a URL-scheme release)

- Same domain: no change-of-address needed.
- Expect `/` to trade planner-term rankings for landing-term ones
  (نقشه مترو، مسیریاب مترو) while `/route` earns its own — fluctuation
  is normal, a sustained drop is not.
- If Tehran map keywords underperform after 4 weeks, consider making
  «نقشه مترو تهران» explicit in the landing H1 area (currently brand-y
  by design; the eyebrow badge + station ticker may already suffice).

## 3. Performance (Lighthouse, mobile + desktop, on `/` and `/route`)

- Against the Vercel preview URL of the release (production data):
  `npx -y lighthouse <url> --preset=desktop --only-categories=performance,seo,accessibility,best-practices`
  (add `--preset=` default mobile run too).
- Budgets: LCP < 2.5s, CLS < 0.1, no serious/critical a11y
  violations (the repo also gates this in `tests/landing.spec.ts` and
  `tests/a11y.spec.ts`).
- Watch the landing hero (live clock, animations, `socialprev.png`)
  — it is the LCP element on `/`.

## 4. Success metric

- `%` of `/` visitors tapping «شروع مسیریابی» (Vercel Analytics funnel).
  Judge the landing on this number, not anecdotes: regulars skip it
  (returning-visitor fast-path + installed start URLs), so the audience
  is first-timers, search traffic, and bare-domain shares.
