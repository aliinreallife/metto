# OG preview examples

Rendered 1200x630 route share cards (`/share/og`) for manual visual review.
Satori PNG bytes are not snapshot-tested; the structural contract lives in
`app/share/og/card.test.ts` and the render contract in `app/share/og/route.test.ts`.

## v9 — dynamic social card mockup (current)

Dark `#0A1218` banner, brand + slogan left, origin/dest rail center, metric
rail right (stops + transfers, no minutes — pixels stay time-independent).

| File | Case |
| --- | --- |
| `tajrish-teatr.png` | 1-transfer route |
| `tajrish-shahid-hemmat.png` | Direct route (`بدون تعویض`) |
| `long-names.png` | Adversarial long station names |
| `abdolabad-irankhodro.png` | Cross-city route, 3 transfers |
| `landmark-pin.png` | Destination place pin label |
| `timed-arrive.png` | Same route with `timeMode=arrive` — byte-identical to `tajrish-teatr.png`, proving time-independence |

Regenerate: call `GET` from `app/share/og/route.ts` with the `/share/og?...`
query and save the PNG body (see `route.test.ts` for URL shapes).
