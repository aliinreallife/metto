# Brag Plan (FA hook 16:9, ≤30s): متو — «تو مترو گم شدی؟ ما هم شده بودیم.»

Based on `brag-output-fa-appstore-v2/` (same real-UI scenes, same claims). Changes: new hook line, timings tightened so the video is **29.9s** (fits Apple's 30s App Preview limit), landscape 1920x1080 @ 30fps, H.264 + AAC.

## Storyboard
1. Hook — 0.0–3.8s — «تو مترو گم شدی؟» (ink) / «ما هم شده بودیم.» (brand red) + lockup «متو | مسیریاب مترو» + 7-line stripe
2. مسیریاب هوشمند — 3.4–8.5s — «مبدأ، مقصد، تمام» — real route result
3. برنامهٔ حرکت قطارها — 8.1–13.1s — «نه حدس، جدول قطار» — next departure → real schedule sheet
4. نزدیک من — 12.7–17.6s — «نزدیک‌ترین ایستگاه، با یک لمس» — real nearby result + filters
5. نقشهٔ مترو — 17.2–22.0s — «کل شبکه، روی یک نقشه» — real map zoom/route
6. همه‌جا همراهت — 21.6–26.4s — «۱۵۱ ایستگاه، ۷ خط» + FA/EN phones + 3 checks
7. CTA — 26.0–29.9s — «همین حالا مسیرت را پیدا کن» + metto.ir + «رایگان»

## Files
`brag.mp4`, `brag.jpg` (thumbnail at 2.9s), `composition/index.html` (source), `tools/render-local.sh` (WSL render fallback; needs a native ffmpeg in /tmp/ffbin). Screenshots are in `composition/assets/img/`; scripts to regenerate them are in `brag-output-fa-appstore-v2/capture/`.

## Before publishing
- Music bed + sfx are reused from earlier brag runs; confirm the licence covers store promotion.
- Screens show the live site at capture time (clock values like ۹:۵۰).
- The hook is tongue-in-cheek brand voice; check it fits each store's tone/review guidelines.
