# Brag Plan (FA app-store v2): متو — مسیریاب مترو

Tone: app-store — clean, professional, feature-forward. Real app screens from the live site (metto.ir, Persian UI, light theme) shown in a phone frame; one feature per scene; 0.4s crossfades; CTA outro. City-agnostic copy (Tehran is just the first network). Duration 31.8s, landscape 1920x1080 @ 30fps (H.264 High, AAC 48 kHz), vol-12 music bed + UI sfx.

Differences from `brag-output-fa-appstore/` (v1): v1 was text/animated-chips only; v2 uses real captured UI, drops the "48 minutes" claim (the app itself says travel time is a work in progress), and only claims offline for the route planner (the app says the full map is not offline).

## Storyboard
1. Hook — 0.0–3.6s — app icon + «متو» + 7-line colour stripe + «مسیریاب مترو»
2. مسیریاب هوشمند — 2.8–8.2s — «مبدأ، مقصد، تمام» — real route result (Tajrish → Sadeghiyeh): stats ring, transfer ring, scroll to «کپی لینک مسیر»
3. برنامهٔ حرکت قطارها — 7.8–13.0s — «نه حدس، جدول قطار» — stations list, «حرکت بعدی» ring, tap «برنامه» → real schedule sheet
4. نزدیک من — 12.6–17.8s — «نزدیک‌ترین ایستگاه، با یک لمس» — real nearby result, amenity-filter ring, first card ring
5. نقشهٔ مترو — 17.4–22.4s — «کل شبکه، روی یک نقشه» — real map: network (z11) → highlighted route → zoomed station names (z13)
6. همه‌جا همراهت — 22.0–27.2s — «۱۵۱ ایستگاه، ۷ خط» + 7 line dots + checks (فارسی و English / مسیریابی بدون اینترنت / شهرهای بیشتر در راه); FA + EN phones
7. Outro CTA — 26.8–31.8s — «همین حالا مسیرت را پیدا کن» + metto.ir + «رایگان» (logo sfx 27.4s)

## Files
- `brag.mp4` — final video; `brag.jpg` — thumbnail (5.2s)
- `composition/index.html` — editable HyperFrames source (assets in `composition/assets/`)
- `capture/` — Playwright scripts that regenerate the real-UI screenshots (`capture3.mjs`, `capture4.mjs`, `capture2.mjs` for the schedule sheet) and `render-local.sh` (WSL render fallback)

## Before publishing
- Store limits differ: Apple App Preview ≤ 30s (this is 31.8s — trim S1/S7 or use the Google Play promo-video slot); check each store's current spec.
- Screens show the live site at capture time (clock values like ۹:۵۰ are from that moment) — re-run the capture scripts if the UI changes.
- Music bed `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` and the sfx are reused from the earlier brag runs; confirm their licence covers store promotion.
- Store badges are intentionally omitted (no confirmed store listing in the repo).
